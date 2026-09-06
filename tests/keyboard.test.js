import test from 'node:test';
import assert from 'node:assert/strict';
import {DrivingInput} from '../src/driving-input.js';
import {VehiclePhysics,CARS} from '../src/physics.js';
const dt=1/120;
function drive(p,k,seconds,steer,curvature=0,extra={}) {
 for(let i=0;i<Math.round(seconds/dt);i++) {
  const raw={steer,...extra};
  p.step(dt,k.sample(raw,p.u,dt,p.config,{yaw:p.yaw,v:p.v,r:p.r,grip:p.grip,curvature}),{curvature,slope:0,wet:0},true);
 }
}
const lateral=p=>p.u*Math.sin(p.yaw)+p.v*Math.cos(p.yaw);
test('Holding a keyboard direction then releasing settles on straight and curved roads',()=>{
 for(const config of CARS)for(const speed of[15,30,55])for(const sign of[-1,1])for(const bend of[0,1]){
  const p=new VehiclePhysics(config),k=new DrivingInput();p.u=speed;
  const curvature=bend*sign*(speed>40?.001:.003);
  drive(p,k,2,sign,curvature);
  assert.ok(p.d*sign>.5,`${config.id} ${speed}: direction must respond`);
  drive(p,k,2,0,curvature);
  const settled=p.d;
  assert.ok(Math.abs(lateral(p))<.8,`${config.id} ${speed}: released sideways speed ${lateral(p)}`);
  drive(p,k,2,0,curvature);
  assert.ok(Math.abs(p.d-settled)<.6,`${config.id} ${speed}: continued drifting after release`);
  assert.equal(p.collisions,0,`${config.id} ${speed}: hit barrier`);
 }
});
test('Opposite keyboard input changes lateral direction and then settles',()=>{
 for(const config of CARS){
  const p=new VehiclePhysics(config),k=new DrivingInput();p.u=30;
  drive(p,k,1.2,1);
  drive(p,k,1.8,-1);
  assert.ok(lateral(p)<-.5,`${config.id}: opposite direction failed`);
  const reversal=p.d;drive(p,k,.4,-1);
  assert.ok(p.d<reversal-.2,`${config.id}: failed to move back`);
  drive(p,k,2,0);
  assert.ok(Math.abs(lateral(p))<.8);
  assert.equal(p.collisions,0);
 }
});
test('Handbrake and unassisted input keep direct steering available',()=>{
 for(const handbrake of[true,false]){
  const direct=new DrivingInput(),assisted=new DrivingInput();
  for(let i=0;i<120;i++){
   const raw={steer:1,handbrake};
   assert.equal(assisted.sample(raw,30,dt,CARS[0],{yaw:.3,v:2,r:.2,curvature:.01,assists:handbrake}).steer,direct.sample(raw,30,dt,CARS[0]).steer);
  }
 }
});
