import test from 'node:test';
import assert from 'node:assert/strict';
import {DrivingInput} from '../src/driving-input.js';
import {CARS} from '../src/physics.js';
const dt=1/120;

test('Road position, curve previews and assist mode cannot steer or change pedal commands',()=>{
 for(const config of CARS)for(const direction of[-1,0,1]){
  const a=new DrivingInput(),b=new DrivingInput();
  for(let i=0;i<180;i++){
   const raw={steer:direction,throttle:1,brake:.2,nitro:true,handbrake:false};
   const plain=a.sample(raw,35,dt,config,{grip:1,v:-2,r:.2,assists:false});
   const nearRail=b.sample(raw,35,dt,config,{grip:1,v:-2,r:.2,assists:true,d:8.2,yaw:-.8,s:2000,curvature:.05,lookCurvature:-.09,maxCurvature:.1,targetSpeed:0});
   assert.deepEqual(nearRail,plain);
   for(const name of['throttle','brake','nitro','handbrake'])assert.equal(nearRail[name],raw[name]);
  }
 }
});
test('Digital steering is progressive, symmetric and stays in the requested direction',()=>{
 for(const config of CARS)for(const speed of[0,5,15,35,60]){
  const left=new DrivingInput(),right=new DrivingInput();let previous=0,last=0;
  for(let i=0;i<120;i++){
   const a=left.sample({steer:1},speed,dt,config),b=right.sample({steer:-1},speed,dt,config);
   assert.ok(a.steer>=0&&a.steer<=1);assert.ok(Math.abs(a.steer+b.steer)<1e-12);
   assert.ok(Math.abs(a.steer-previous)<.08);previous=a.steer;last=a.steer;
  }
  assert.ok(last>0);
  for(let i=0;i<36;i++)last=left.sample({steer:0},speed,dt,config).steer;
  assert.equal(last,0);left.reset();assert.equal(left.steer,0);
 }
});
test('Countersteering continues promptly through neutral without a sudden slow phase',()=>{
 const keyboard=new DrivingInput();for(let i=0;i<120;i++)keyboard.sample({steer:1},55,dt,CARS[0]);
 let command;for(let i=0;i<54;i++)command=keyboard.sample({steer:-1},55,dt,CARS[0]);
 assert.equal(keyboard.steer,-1);assert.ok(command.steer<0);
});
test('Extra opposite lock only follows a deliberate countersteer, never a released key',()=>{
 const sliding=new DrivingInput(),normal=new DrivingInput();let a,b;
 for(let i=0;i<120;i++){
  a=sliding.sample({steer:-1},25,dt,CARS[1],{v:-4,r:.8});
  b=normal.sample({steer:-1},25,dt,CARS[1],{v:0,r:0});
 }
 assert.ok(a.steer<b.steer);
 const released=new DrivingInput();assert.equal(released.sample({steer:0},25,dt,CARS[1],{v:-4,r:.8}).steer,0);
});
test('Input response is independent of render frequency',()=>{
 function run(rate){const keyboard=new DrivingInput();let command;for(let i=0;i<rate*.5;i++)command=keyboard.sample({steer:1,throttle:1},35,1/rate,CARS[0]);return command;}
 assert.ok(Math.abs(run(60).steer-run(120).steer)<1e-12);
});

test('A short release preserves deliberate reverse input while neutral never steers by itself',()=>{
 for(const pause of[.1,.3,.4]){
  const remembered=new DrivingInput(),fresh=new DrivingInput();
  for(let i=0;i<60;i++)remembered.sample({steer:1},100/3.6,dt,CARS[0]);
  for(let i=0;i<Math.round(pause/dt);i++)assert.equal(remembered.sample({steer:0},100/3.6,dt,CARS[0]).steer,0);
  const recovery=remembered.sample({steer:-1},100/3.6,dt,CARS[0]);
  const ordinary=fresh.sample({steer:-1},100/3.6,dt,CARS[0]);
  assert.ok(Math.abs(recovery.steer)>Math.abs(ordinary.steer)*1.5);
  assert.equal(remembered.sample({steer:0},100/3.6,dt,CARS[0]).steer,0);
  remembered.reset();assert.deepEqual(remembered.sample({steer:-1},100/3.6,dt,CARS[0]),new DrivingInput().sample({steer:-1},100/3.6,dt,CARS[0]));
 }
});
