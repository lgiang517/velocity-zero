import test from 'node:test';
import assert from 'node:assert/strict';
import {VehiclePhysics,CARS} from '../src/physics.js';
import {DrivingInput} from '../src/driving-input.js';
const dt=1/120;
for(const config of CARS)test(`${config.id}: reverse steering retains direction and authority through the tyre-model transition`,()=>{
 for(const speed of[1,3,5,7,9])for(const side of[-1,1])for(const wet of[0,.9])for(const assists of[true,false]){
  const p=new VehiclePhysics(config),keys=new DrivingInput();p.u=-speed;p.reverseHold=1;
  // Open pad isolates tyre response from the separately tested road rail impacts.
  p.resolveBarrier=()=>false;
  for(let i=0;i<120;i++){
   p.step(dt,keys.sample({steer:side*.3,brake:1},p.u,dt,config,p),{curvature:0,slope:0,wet},assists);
   assert.ok(Number.isFinite(p.r)&&Number.isFinite(p.v));
   assert.ok(side*p.r<=.003,`reverse yaw changed direction: speed=${speed} wet=${wet} assists=${assists} r=${p.r}`);
  }
  const expected=p.u*Math.tan(p.steer)/config.wheelbase;
  assert.ok(Math.abs(p.r)>Math.abs(expected)*.25,`reverse steering cancelled: speed=${speed} wet=${wet} assists=${assists}`);
 }
});
test('normal reverse yaw does not request extra countersteering lock',()=>{
 for(const config of CARS){
  const forward=new DrivingInput(),reverse=new DrivingInput();let a,b;
  for(let i=0;i<90;i++){
   a=forward.sample({steer:1},9,dt,config,{v:.8,r:.3});
   b=reverse.sample({steer:1},-9,dt,config,{v:-.8,r:-.3});
  }
  assert.ok(Math.abs(a.steer-b.steer)<1e-12,config.id+': normal reversing was misclassified as countersteering');
 }
});
