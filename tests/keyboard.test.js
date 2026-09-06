import test from 'node:test';
import assert from 'node:assert/strict';
import {DrivingInput} from '../src/driving-input.js';
import {VehiclePhysics,CARS,clamp} from '../src/physics.js';
const dt=1/120;
const road=k=>({curvature:k,slope:0,wet:0});
function advance(p,k,seconds,steer,curvature=0){for(let i=0;i<seconds/dt;i++)p.step(dt,k.sample({steer},p.u,dt,p.config,p),road(curvature),true);}
// Test driver holds a radius-matching steering angle with small manual corrections.
// This acts only through the input API; position, heading and velocities are never overwritten.
function steeringForBend(p,curvature){
 const c=p.config,u=p.u,a=c.wheelbase*.49,b=c.wheelbase*.51;
 const understeer=c.mass/c.wheelbase*(b/75000-a/78000);
 const angle=Math.atan(c.wheelbase*curvature)+understeer*u*u*curvature
  -.25*(p.yaw+Math.atan2(p.v,u))-.012*p.d;
 const full=new DrivingInput();full.steer=1;
 const maxAngle=full.sample({steer:1},u,dt,c,p).steer*c.steer/(1+u/32);
 const fraction=clamp(Math.abs(angle/maxAngle),0,1);
 return Math.sign(angle)*(-.38+Math.sqrt(.38**2+4*.62*fraction))/(2*.62);
}
test('All cars can hold manually steered tight bends for eight seconds at 15 m/s',()=>{
 for(const config of CARS)for(const sign of[-1,1])for(const radiusInverse of[.01,.02,.03]){
  const p=new VehiclePhysics(config),keyboard=new DrivingInput();p.u=15;
  const curvature=sign*radiusInverse;let minimumSpeed=15,maxD=0;
  for(let i=0;i<960;i++){
   const raw={steer:steeringForBend(p,curvature),throttle:clamp((15-p.u)*.5,0,1)};
   p.step(dt,keyboard.sample(raw,p.u,dt,config,p),road(curvature),true);
   minimumSpeed=Math.min(minimumSpeed,p.u);maxD=Math.max(maxD,Math.abs(p.d));
  }
  assert.equal(p.collisions,0,`${config.id} k=${curvature}: hits ${p.collisions}, max lateral ${maxD}`);
  assert.ok(minimumSpeed>14.5,`${config.id}: speed dropped to ${minimumSpeed}`);
  assert.ok(Math.abs(p.d)<1,`${config.id}: unable to settle on requested radius, d=${p.d}`);
 }
});
test('Releasing steering reduces yaw rate while retaining the new world heading',()=>{
 for(const config of CARS){
  const p=new VehiclePhysics(config),keyboard=new DrivingInput();p.u=15;
  advance(p,keyboard,.6,.5);const turningRate=p.r,heading=p.yaw;
  assert.ok(turningRate>.05);
  advance(p,keyboard,2,0);
  assert.ok(Math.abs(p.r)<turningRate*.1,`${config.id}: yaw rate ${p.r}`);
  assert.ok(p.yaw>=heading*.95,`${config.id}: heading auto-aligned to road`);
  assert.equal(p.collisions,0);
 }
});
test('Startup steering remains continuous through 3 and 6 m/s without reversing',()=>{
 for(const config of CARS)for(const direction of[-1,1]){
  const p=new VehiclePhysics(config),keyboard=new DrivingInput();let previous=0,previousLateralAcceleration=0,crossed3=false,crossed6=false;
  for(let i=0;i<600&&p.u<8;i++){
   const command=keyboard.sample({steer:p.u<8?direction:0,throttle:1},p.u,dt,config,p);
   if(p.u>2&&p.u<7.5)assert.ok(Math.abs(command.steer-previous)<.04,`${config.id}: discontinuous command at ${p.u}`);
   assert.ok(command.steer*direction>=0);
   const before=p.u,beforeV=p.v;p.step(dt,command,road(0),true);
   const lateralAcceleration=(p.v-beforeV)/dt;
   if(Math.abs(before-3)<.3||Math.abs(before-6)<.3)assert.ok(Math.abs(lateralAcceleration-previousLateralAcceleration)<.5,`${config.id}: lateral acceleration jumps at ${before}`);
   previousLateralAcceleration=lateralAcceleration;
   crossed3 ||= before<=3&&p.u>3;crossed6 ||= before<=6&&p.u>6;previous=command.steer;
  }
  assert.ok(crossed3&&crossed6);
 }
});
test('Countersteering reverses yaw rate through physical response',()=>{
 for(const config of CARS){
  const p=new VehiclePhysics(config),keyboard=new DrivingInput();p.u=15;
  advance(p,keyboard,.6,.6);const initialRate=p.r,initialD=p.d;
  advance(p,keyboard,dt,-.6);
  assert.ok(p.r>0,`${config.id}: yaw changed instantly`);
  assert.ok(Math.abs(p.d-initialD)<.1);
  advance(p,keyboard,1,-.6);
  assert.ok(p.r<-.05&&initialRate>.05,`${config.id}: failed to reverse yaw`);
  assert.equal(p.collisions,0);
 }
});
test('Steering input never follows road curvature or heading automatically',()=>{
 for(const config of CARS){
  const a=new DrivingInput(),b=new DrivingInput();
  for(let i=0;i<120;i++)assert.equal(a.sample({steer:.5},20,dt,config,{grip:1,yaw:0,curvature:0}).steer,b.sample({steer:.5},20,dt,config,{grip:1,yaw:.7,v:4,r:.6,curvature:.03}).steer);
 }
});
