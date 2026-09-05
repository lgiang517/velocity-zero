import {DrivingInput} from '../src/driving-input.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {VehiclePhysics,DriverAI,CARS} from '../src/physics.js';
import {CoastTrack} from '../src/track.js';
const dt=1/120;
function run(p,seconds,input,wet=0){for(let i=0;i<seconds/dt;i++)p.step(dt,input,{curvature:0,slope:0,wet},true);return p;}
test('Cars accelerate continuously and retain distinct performance',()=>{
 const speeds=CARS.map(c=>run(new VehiclePhysics(c),10,{throttle:1}).u*3.6);
 assert.ok(speeds.every(s=>s>130&&s<270),speeds.join(', '));
 assert.ok(Math.max(...speeds)-Math.min(...speeds)>8,speeds.join(', '));
});
test('Wet braking takes more road, and ABS never sends the vehicle into reverse',()=>{
 function stop(wet){const p=new VehiclePhysics();p.u=55;let ticks=0;while(p.u>.1&&ticks++<1500)p.step(dt,{brake:1},{curvature:0,slope:0,wet},true);return p;}
 const dry=stop(0),wet=stop(1);assert.ok(wet.s>dry.s*1.12,dry.s+' vs '+wet.s);assert.ok(dry.u>=0);
});
test('Handbrake changes yaw and tire slip instead of directly moving sideways',()=>{
 const normal=new VehiclePhysics(CARS[1]),drift=new VehiclePhysics(CARS[1]);normal.u=drift.u=30;
 run(normal,.6,{steer:.6,throttle:.3});run(drift,.6,{steer:.6,throttle:.3,handbrake:true});
 assert.ok(Math.abs(drift.r)>Math.abs(normal.r)*1.05,drift.r+', '+normal.r);
 assert.ok(drift.slip>normal.slip,drift.slip+', '+normal.slip);assert.ok(Math.abs(drift.d)<6);
});
test('Nitrous consumes charge and produces meaningful acceleration',()=>{
 const normal=new VehiclePhysics(),boost=new VehiclePhysics();normal.u=boost.u=40;
 run(normal,3,{throttle:1});run(boost,3,{throttle:1,nitro:true});assert.ok(boost.u-normal.u>10);assert.ok(boost.nitro<30);assert.ok(boost.nitro>=0);
});
test('Track is continuous, elevated and numerically valid at seam',()=>{
 const track=new CoastTrack();assert.ok(track.length>4500);assert.ok(track.sample(0).p.distanceTo(track.sample(track.length).p)<.001);
 assert.ok(Math.max(...track.samples.map(s=>s.p.y))-Math.min(...track.samples.map(s=>s.p.y))>175);
 for(const s of[-1,0,100,track.length-1,track.length+1]){const q=track.sample(s);assert.ok(Number.isFinite(q.curvature));assert.ok(Number.isFinite(q.heading));}
});
test('AI drives a full coast without teleporting or getting trapped',()=>{
 const track=new CoastTrack(),p=new VehiclePhysics(),player=new VehiclePhysics();p.reset(45,2.6);player.reset(-500,0);const ai=new DriverAI(p);let maxD=0;
 for(let tick=0;tick<120*300&&p.s<track.length+45;tick++){
  const q=track.sample(p.s);p.step(dt,ai.controls(track,player,[p,player],tick*dt),{curvature:q.curvature,slope:q.slope,wet:0},true);maxD=Math.max(maxD,Math.abs(p.d));
  assert.ok(Number.isFinite(p.u)&&Number.isFinite(p.yaw));
 }
 assert.ok(p.s>track.length,'AI stopped at '+p.s+'/'+track.length+'; speed '+p.u+'; lateral '+p.d+'; collisions '+p.collisions);
 assert.ok(p.collisions<12,'AI hit barriers '+p.collisions+' times; max lateral '+maxD);
});
test('Mixed-input wet driving stays finite and within barriers',()=>{
 const track=new CoastTrack(),p=new VehiclePhysics(CARS[1]);
 for(let i=0;i<120*50;i++){const q=track.sample(p.s);p.step(dt,{throttle:i%500<400?1:0,brake:i%700>620?1:0,steer:Math.sin(i*.009),handbrake:i%400>370,nitro:i%600>450},{curvature:q.curvature,slope:q.slope,wet:.9},false);assert.ok(Number.isFinite(p.s)&&Number.isFinite(p.u));assert.ok(Math.abs(p.d)<=9.501);}
});

test('Brief keyboard taps make small lane corrections at every road speed',()=>{
 function pulse(filtered,speed,direction=1){
  const p=new VehiclePhysics(),keyboard=new DrivingInput();p.u=speed;
  for(let i=0;i<120;i++){
   const raw={steer:i<14?direction:0};
   p.step(dt,filtered?keyboard.sample(raw,p.u,dt,p.config):raw,{curvature:0,slope:0,wet:0},true);
  }
  return p.d;
 }
 for(const speed of[10,30,55,75]){
  const direct=pulse(false,speed),gentle=pulse(true,speed);
  assert.ok(gentle>.03&&gentle<.4,`speed ${speed}: moved ${gentle} m`);
  assert.ok(gentle<direct*.25);
  assert.ok(Math.abs(gentle+pulse(true,speed,-1))<1e-9);
 }
});

test('Keyboard steering preserves low-speed lock, reduces high-speed lock and returns to centre',()=>{
 for(const config of CARS){
  const slow=new DrivingInput(),fast=new DrivingInput();let low,high;
  for(let i=0;i<120;i++){
   low=slow.sample({steer:1},5,dt,config);
   high=fast.sample({steer:1},55,dt,config);
  }
  assert.ok(low.steer>.9);
  assert.ok(high.steer>.25&&high.steer<.6);
  let released;
  for(let i=0;i<36;i++)released=fast.sample({steer:0},55,dt,config);
  assert.equal(released.steer,0);
  fast.sample({steer:1},55,dt,config);fast.reset();assert.equal(fast.steer,0);
 }
});

test('Keyboard steering is consistent across update rates and countersteers promptly',()=>{
 function turn(rate){const k=new DrivingInput();let value;for(let i=0;i<rate*.5;i++)value=k.sample({steer:1},45,1/rate,CARS[0]);return value.steer;}
 assert.ok(Math.abs(turn(60)-turn(120))<1e-8);
 const keyboard=new DrivingInput();for(let i=0;i<120;i++)keyboard.sample({steer:1},55,dt,CARS[0]);
 let opposite;for(let i=0;i<36;i++)opposite=keyboard.sample({steer:-1},55,dt,CARS[0]);
 assert.ok(opposite.steer<0);
});
