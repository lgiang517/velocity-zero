import test from 'node:test';
import assert from 'node:assert/strict';
import {VehiclePhysics,CARS} from '../src/physics.js';
import {DrivingInput} from '../src/driving-input.js';
import {barrierLimit,lateralExtent} from '../src/road-boundaries.js';
import {CoastTrack} from '../src/track.js';
const dt=1/120;

test('A rear corner brushing the shoulder rail can unwind while its envelope shrinks',()=>{
 for(const config of CARS)for(const side of[-1,1])for(const curvature of[-.015,0,.015])for(const offset of[9.85,15.7]){
  const p=new VehiclePhysics(config);p.u=4;p.yaw=-side*.32;
  p.d=side*(barrierLimit(config,p.yaw,curvature,offset)+.002);
  const along=p.u*Math.cos(p.yaw),roadRate=curvature*along;
  p.r=roadRate+side*.22;
  const initialYaw=p.yaw,initialRate=p.r,initialLateral=p.u*Math.sin(p.yaw),initialExtent=lateralExtent(config,p.yaw,curvature);
  assert.ok(lateralExtent(config,p.yaw+(p.r-roadRate)*dt,curvature)<initialExtent);
  for(let pass=0;pass<5;pass++)p.resolveBarrier(curvature,dt,offset);
  assert.equal(p.r,initialRate,`${config.id}: valid unwinding must not be cancelled at the rail`);
  assert.equal(p.yaw,initialYaw);
  assert.ok(Math.abs(p.u*Math.sin(p.yaw)+p.v*Math.cos(p.yaw)-initialLateral)<1e-10);
  assert.ok(Math.abs(p.d)<=barrierLimit(config,p.yaw,curvature,offset)+1e-10);
 }
});

test('Rotation that sweeps the front farther into the rail is still constrained',()=>{
 for(const config of CARS)for(const side of[-1,1])for(const offset of[9.85,15.7]){
  const p=new VehiclePhysics(config);p.u=4;p.yaw=side*.32;p.r=side*.22;
  p.d=side*(barrierLimit(config,p.yaw,0,offset)+.002);
  p.resolveBarrier(0,dt,offset);
  assert.equal(p.r,0);assert.ok(Math.abs(p.d)<=barrierLimit(config,p.yaw,0,offset)+1e-10);
 }
});

test('Shoulder return remains usable on actual narrow and wide roads, without rail penetration',()=>{
 const track=new CoastTrack();
 for(const config of CARS)for(const side of[-1,1])for(const wet of[0,.9])for(const speed of[0,8,15])for(const s of[45,track.sectionS('hzmb',.3),track.sectionS('duku',.15)]){
  const initial=track.sample(s),p=new VehiclePhysics(config),input=new DrivingInput();
  p.reset(s);p.u=speed;p.yaw=side*.15;
  p.d=side*(barrierLimit(config,p.yaw,initial.curvature,initial.barrierOffset)-.001);
  let escaped=false;
  for(let i=0;i<480;i++){
   const q=track.sample(p.s),command=input.sample({steer:-side,throttle:.4},p.u,dt,config,p);
   p.step(dt,command,{...q,wet},true);
   // Match the game's repeated rail/contact solver passes after a physics tick.
   for(let pass=0;pass<4;pass++){const current=track.sample(p.s);p.resolveBarrier(current.curvature,dt,current.barrierOffset);p.resolveMedian(current.medianHalfWidth,current.curvature,dt);}
   const current=track.sample(p.s);
   assert.ok(Math.abs(p.d)<=barrierLimit(config,p.yaw,current.curvature,current.barrierOffset)+1e-9);
   const whiteLine=current.asphaltHalfWidth*7.65/8.4;
   if(side*p.d+lateralExtent(config,p.yaw,current.curvature)<=whiteLine){escaped=true;break;}
  }
  assert.ok(escaped,`${config.id}: failed to return fully inside the white line`);
 }
});
