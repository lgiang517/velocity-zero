import test from 'node:test';
import assert from 'node:assert/strict';
import {VehiclePhysics,CARS} from '../src/physics.js';
const dt=1/120,road={curvature:0,slope:0,wet:0};
function run(p,seconds,input){for(let i=0;i<Math.round(seconds/dt);i++)p.step(dt,input,road,true);}
for(const config of CARS){
 test(`${config.id}: releasing and reapplying reverse resumes backing without a brake-to-stop cycle`,()=>{
  const p=new VehiclePhysics(config);run(p,3,{brake:1});run(p,.3,{});
  const released=p.u;assert.ok(released<-3);
  run(p,.1,{brake:1});assert.ok(p.u<released,'S must resume reverse drive, not brake an already selected reverse gear');
  run(p,.3,{brake:1});assert.ok(p.u<released-.3);
 });
 test(`${config.id}: reverse memory clears at rest and initial S still waits before backing`,()=>{
  const p=new VehiclePhysics(config);run(p,3,{brake:1});
  for(let i=0;i<1200&&p.u<0;i++){const previous=p.u;p.step(dt,{},road,true);assert.ok(p.u>=previous);}
  assert.equal(p.u,0);
  run(p,.4,{brake:1});assert.equal(p.u,0,'a fresh S press at rest must not reverse instantly');
  run(p,.5,{brake:1});assert.ok(p.u<-.2);
 });
 test(`${config.id}: unintended rollback and simultaneous pedals do not engage reverse drive`,()=>{
  const rollback=new VehiclePhysics(config);rollback.u=-4;
  run(rollback,.3,{brake:1});assert.ok(rollback.u>-4,'rolling backwards without reverse selection must still brake');
  const p=new VehiclePhysics(config);run(p,3,{brake:1});
  run(p,1.5,{brake:1,throttle:1,nitro:true});
  assert.ok(Math.abs(p.u)<.2,'both pedals must stop instead of powering reverse');
  assert.equal(p.boost,false);
 });
 test(`${config.id}: choosing forward drive cancels the reverse engagement`,()=>{
  const p=new VehiclePhysics(config);run(p,3,{brake:1});run(p,.1,{throttle:1});
  assert.equal(p.reverseHold,0);const before=p.u;run(p,.3,{brake:1});assert.ok(p.u>before);
 });
}

for(const config of CARS)test(`${config.id}: fast uncommanded rollback must stop before selecting reverse`,()=>{
 const p=new VehiclePhysics(config);p.u=-9;let stopped=false;
 for(let i=0;i<360;i++){
  p.step(dt,{brake:1},road,true);
  if(Math.abs(p.u)<.15)stopped=true;
  if(p.reverseHold>.65)assert.ok(stopped,'reverse selected before the uncommanded rollback stopped');
 }
 assert.ok(stopped);assert.ok(p.u<-.2,'holding S after stopping must still engage reverse');
});
