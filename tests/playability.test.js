import test from 'node:test';
import assert from 'node:assert/strict';
import {DrivingInput} from '../src/driving-input.js';
import {CoastTrack} from '../src/track.js';
import {VehiclePhysics,CARS} from '../src/physics.js';
const dt=1/120;
const road=curvature=>({curvature,slope:0,wet:0});
function tick(p,k,input,curvature=0,assists=true){
 const command=k.sample(input,p.u,dt,p.config,{...p,assists,curvature,lookCurvature:.09,maxCurvature:.1,targetSpeed:0});
 for(const field of['throttle','brake','nitro'])assert.equal(command[field],input[field]);
 p.step(dt,command,road(curvature),assists);return command;
}
function drive(p,k,seconds,input,curvature=0,assists=true){for(let i=0;i<Math.round(seconds/dt);i++)tick(p,k,input,curvature,assists);}
for(const config of CARS)test(`${config.id}: W launch from zero to 20 m/s has no steering or body-roll jitter`,()=>{
 for(const curvature of[0,.01]){
  const p=new VehiclePhysics(config),k=new DrivingInput();let t=0,lastPitch=0;
  for(;t<4&&p.u<20;t+=dt){
   tick(p,k,{steer:0,throttle:1,brake:0,nitro:false},curvature);
   assert.equal(p.steer,0);assert.equal(p.r,0);assert.equal(p.roll,0);
   assert.ok(Math.abs(p.pitch-lastPitch)<.001);lastPitch=p.pitch;
  }
  assert.ok(p.u>=20&&t<3);assert.equal(p.collisions,0);
  if(curvature===0){assert.equal(p.d,0);assert.equal(p.yaw,0);}
  else {assert.ok(p.d< -1);assert.ok(Math.abs(p.yaw+curvature*p.s)<1e-8,'Car must keep world heading rather than follow road');}
 }
});
test('A digital tap makes a small correction and holding the same key keeps turning',()=>{
 for(const config of CARS){
  const pulse=new VehiclePhysics(config),held=new VehiclePhysics(config),a=new DrivingInput(),b=new DrivingInput();pulse.u=held.u=25;
  drive(pulse,a,.1,{steer:1});drive(pulse,a,.9,{steer:0});
  drive(held,b,.6,{steer:1});
  assert.ok(pulse.d>0&&pulse.d<.3);assert.ok(held.yaw>pulse.yaw*5&&held.r>.1);
  assert.equal(pulse.collisions,0);assert.equal(held.collisions,0);
 }
});
test('Releasing the key centres the rack smoothly but does not return to a lane or heading',()=>{
 for(const config of CARS){
  const p=new VehiclePhysics(config),k=new DrivingInput();p.u=15;
  drive(p,k,.4,{steer:1});const oldHeading=p.yaw,oldRate=p.r,oldSteer=p.steer;
  tick(p,k,{steer:0});assert.ok(p.steer>0&&p.steer<oldSteer);
  drive(p,k,1.5,{steer:0});
  assert.ok(Math.abs(p.r)<oldRate*.1);assert.ok(p.yaw>=oldHeading*.95);assert.equal(p.collisions,0);
 }
});
test('Digital opposite input reverses yaw through inertia instead of jumping sideways',()=>{
 for(const config of CARS){
  const p=new VehiclePhysics(config),k=new DrivingInput();p.u=25;
  drive(p,k,.6,{steer:1});const initialD=p.d,initialRate=p.r;
  tick(p,k,{steer:-1});assert.ok(p.r>0);assert.ok(Math.abs(p.d-initialD)<.1);
  drive(p,k,.6,{steer:-1});assert.ok(initialRate>.1&&p.r<-.05);assert.equal(p.collisions,0);
 }
});
test('Handbrake permits a slide and deliberate opposite lock catches it',()=>{
 for(const config of CARS){
  const p=new VehiclePhysics(config),k=new DrivingInput();p.u=25;
  drive(p,k,.5,{steer:1,throttle:.35,handbrake:true});const driftSlip=p.slip;
  assert.ok(driftSlip>.06&&p.r>.5);
  drive(p,k,.45,{steer:-1,throttle:0,handbrake:false});
  drive(p,k,.35,{steer:0,throttle:0,handbrake:false});
  assert.ok(p.slip<driftSlip*.6,`${config.id}: slide did not recover`);
  assert.ok(p.r<0);assert.equal(p.collisions,0);
 }
});
test('Holding a wrong direction can still hit the barrier; controls never prevent the mistake',()=>{
 const p=new VehiclePhysics(),k=new DrivingInput();p.u=25;
 for(let i=0;i<120*6&&!p.collisions;i++){
  const command=tick(p,k,{steer:1,throttle:1,brake:0,nitro:true});
  assert.ok(command.steer>0);assert.equal(command.throttle,1);assert.equal(command.brake,0);assert.equal(command.nitro,true);
 }
 assert.ok(p.collisions>0);
});

// Rail contact constrains penetration, not the driver's motion away from it.
import {barrierLimit} from '../src/road-boundaries.js';
test('A rear corner touching the rail preserves inward velocity and turning',()=>{
 for(const config of CARS)for(const side of[-1,1])for(const curvature of[-.015,0,.015]){
  const p=new VehiclePhysics(config);p.u=15;p.yaw=-side*.12;
  const along=p.u*Math.cos(p.yaw);p.r=curvature*along-side*.08;
  p.d=side*(barrierLimit(config,p.yaw,curvature)+.04);
  const oldLateral=p.u*Math.sin(p.yaw)+p.v*Math.cos(p.yaw),oldYaw=p.yaw,oldRate=p.r;
  assert.equal(p.resolveBarrier(curvature,dt),true);
  assert.ok(Math.abs(p.u*Math.sin(p.yaw)+p.v*Math.cos(p.yaw)-oldLateral)<1e-10);
  assert.equal(p.yaw,oldYaw);assert.equal(p.r,oldRate);
  assert.ok(Math.abs(p.d)<=barrierLimit(config,p.yaw,curvature)+1e-9);
 }
});
test('All cars can turn away from either shoulder at low and high speeds on dry and wet roads',()=>{
 for(const config of CARS)for(const side of[-1,1])for(const wet of[0,.9])for(const speed of[2,15,40]){
  const p=new VehiclePhysics(config),keyboard=new DrivingInput();p.u=speed;p.yaw=side*.12;p.r=side*.08;
  p.d=side*(barrierLimit(config,p.yaw)+.03);let elapsed=0;
  for(;elapsed<3&&side*p.d>6.5;elapsed+=dt){
   const command=keyboard.sample({steer:-side,throttle:.4},p.u,dt,config,p);
   p.step(dt,command,{curvature:0,slope:0,wet},true);
  }
  assert.ok(side*p.d<=6.5,`${config.id}, side=${side}, wet=${wet}, speed=${speed}: pinned at ${p.d}`);
  assert.ok(p.u>0);assert.ok(elapsed<2.5,'Rail contact must not delay the deliberate return');
 }
});
test('Releasing W produces smooth engine braking and the brake pedal is substantially stronger',()=>{
 for(const config of CARS){
  const coast=new VehiclePhysics(config),braking=new VehiclePhysics(config);coast.u=braking.u=25;coast.throttle=braking.throttle=1;
  let previousSpeed=25,coastAtOne;
  for(let i=0;i<600;i++){
   coast.step(dt,{throttle:0},road(0),true);
   assert.ok(coast.u<=previousSpeed+1e-12,'Closed throttle must not keep adding engine torque');
   assert.ok(previousSpeed-coast.u<.035,'Coasting must not act like a sudden brake');previousSpeed=coast.u;
   if(i<120)braking.step(dt,{throttle:0,brake:1},road(0),true);
   if(i===119)coastAtOne=coast.u;
  }
  assert.ok(coast.u*3.6>40&&coast.u*3.6<55,'Sport-gear overrun must clearly reduce speed within five seconds');
  assert.ok(braking.u<coastAtOne-6,'Brake pedal must slow the car much more than releasing W');
  const rolling=new VehiclePhysics(config);rolling.u=2;
  for(let i=0;i<1200;i++)rolling.step(dt,{throttle:0},road(0),true);
  assert.equal(rolling.u,0,'Coasting to rest must not engage reverse');
 }
});

test('Brake response is immediate while a dry 100 km/h stop retains a realistic distance',()=>{
 for(const config of CARS){
  const p=new VehiclePhysics(config);p.u=100/3.6;let elapsed=0,at90=0;
  for(;p.u>.1&&elapsed<5;elapsed+=dt){
   p.step(dt,{brake:1},road(0),true);
   if(!at90&&p.brake>=.9)at90=elapsed+dt;
  }
  assert.ok(at90>=.075&&at90<=.1);
  assert.ok(p.u<=.1&&p.s>=35&&p.s<=45,config.id+': stopping distance '+p.s);
 }
});

test('Late opposite input recovers actual lateral position at 80 to 120 km/h, including a 400 ms pause',()=>{
 const track=new CoastTrack();
 for(const config of CARS)for(const kmh of[80,100,120])for(const gap of[.1,.3,.4])for(const side of[-1,1]){
  const p=new VehiclePhysics(config),keyboard=new DrivingInput();p.reset(3500);p.u=kmh/3.6;
  let inwardAt=null,maxOutward=0;
  const reverseAt=.8+gap;
  for(let i=0;i<Math.round((reverseAt+.6+1.5)/dt);i++){
   const t=i*dt,previous=p.d,q=track.sample(p.s);
   const steer=side*(t<.8?1:t<reverseAt?0:t<reverseAt+.6?-1:0);
   const command=keyboard.sample({steer,throttle:0,brake:0},p.u,dt,config,p);
   p.step(dt,command,{curvature:q.curvature,slope:q.slope,wet:0},true);
   maxOutward=Math.max(maxOutward,side*p.d);
   if(t>=reverseAt&&inwardAt===null&&side*(p.d-previous)<0)inwardAt=t-reverseAt;
   assert.equal(p.collisions,0,config.id+': delayed correction hit a rail');
  }
  assert.ok(inwardAt!==null&&inwardAt<2,config.id+': yaw stopped but position never recovered');
  assert.ok(maxOutward<6&&side*p.d<maxOutward,'Position must actually move back inward');
 }
});

test('Sport overrun slows continuously even on the steepest downhill without automatic braking',()=>{
 for(const config of CARS)for(const start of[90,100]){
  const p=new VehiclePhysics(config),keyboard=new DrivingInput();p.u=start/3.6;p.throttle=1;p.boost=true;
  for(let i=0;i<600;i++){
   const previous=p.u,command=keyboard.sample({steer:0,throttle:0,brake:0,nitro:true},p.u,dt,config,p);
   assert.equal(command.brake,0);assert.equal(command.throttle,0);
   p.step(dt,command,{curvature:0,slope:-.19,wet:0},true);
   assert.ok(p.u<previous,'Every downhill step must lose speed after lift-off');
   assert.equal(p.boost,false);assert.equal(p.brake,0);
  }
  assert.ok(p.u*3.6<start-15);
 }
});

test('Paved shoulder grip changes continuously across the road edge',()=>{
 for(const config of CARS)for(const side of[-1,1]){
  let previous=config.grip;
  for(let d=8;d<=9.3;d+=.02){
   const p=new VehiclePhysics(config);p.d=side*d;p.step(dt,{},road(0),true);
   if(d>8)assert.ok(previous-p.grip>=-1e-12&&previous-p.grip<.006);
   previous=p.grip;
  }
  assert.ok(previous>config.grip*.78);
 }
});

test('Fixed-radius entry lift, steady corner and exit throttle stay balanced on dry and wet roads',()=>{
 for(const config of CARS)for(const wet of[0,.9])for(const radius of[35,60,120])for(const side of[-1,1]){
  const p=new VehiclePhysics(config);p.u=Math.sqrt(4*radius);
  const a=config.wheelbase*.49,b=config.wheelbase*.51;
  const under=Math.max(0,config.mass/config.wheelbase*(b/75000-a/78000));
  // A fixed driver wheel command calculated once; no feedback from road position or preview.
  const steer=side*(Math.atan(config.wheelbase/radius)+under*4)/(config.steer/(1+p.u/32));
  let previousRate=0;
  for(let i=0;i<492;i++){
   const t=i*dt,opening=t<3.1?1:Math.max(0,1-(t-3.1));
   const throttle=t<1.5?.04:t<2.1?0:t<3.1?.04:.35;
   p.step(dt,{steer:steer*opening,throttle},{curvature:side/radius,slope:0,wet},true);
   assert.ok(p.slip<.05,'Lift-off must not trigger an unexplained rear slide');
   assert.ok(side*p.r>=0&&Math.abs(p.r-previousRate)<.02,'Yaw response must stay continuous');
   assert.equal(p.collisions,0);previousRate=p.r;
  }
 }
});

test('Raw keyboard taps, holds and release retain their behavior on dry and wet roads',()=>{
 for(const config of CARS)for(const wet of[0,.9])for(const speed of[15,25,40]){
  const run=duration=>{
   const p=new VehiclePhysics(config),keyboard=new DrivingInput();p.u=speed;
   for(let i=0;i<120;i++){
    const command=keyboard.sample({steer:i*dt<duration?1:0},p.u,dt,config,p);
    p.step(dt,command,{curvature:0,slope:0,wet},true);
    assert.equal(p.collisions,0);assert.ok(p.r>-.003&&Number.isFinite(p.yaw));
   }
   return p;
  };
  const tap=run(.2),held=run(.7);
  assert.ok(held.d>tap.d*1.5);assert.ok(Math.abs(tap.steer)<.001);
 }
});

test('Default stability contains ordinary W plus direction and lift-off without precise countersteering',()=>{
 for(const config of CARS)for(const speed of[15,25,40,55])for(const wet of[0,.9])for(const hold of[.6,1,2])for(const lift of[false,true])for(const side of[-1,1]){
  const p=new VehiclePhysics(config),keyboard=new DrivingInput();p.u=speed;p.throttle=1;
  // An open skidpad isolates handling from barrier impacts; barrier containment has separate tests.
  p.resolveBarrier=()=>false;
  for(let i=0;i<Math.round((hold+.6)/dt);i++){
   const t=i*dt,raw={steer:t<hold?side:0,throttle:lift&&t>.3?0:1,brake:0};
   const command=keyboard.sample(raw,p.u,dt,config,p);
   assert.equal(command.throttle,raw.throttle);assert.equal(command.brake,0);
   p.step(dt,command, {curvature:0,slope:0,wet},true);
   assert.ok(p.slip<.1,config.id+': ordinary turn became a tail slide');
  }
  assert.ok(Math.abs(p.r)<.01,'Releasing direction must stop extra rear rotation promptly');
 }
});

test('The driver brake pedal overrides a held accelerator and nitrous',()=>{
 for(const config of CARS)for(const speed of[10,25,45]){
  const both=new VehiclePhysics(config),brakeOnly=new VehiclePhysics(config);
  both.u=brakeOnly.u=speed;both.throttle=brakeOnly.throttle=1;
  for(let i=0;i<60;i++){
   const previous=both.u;
   both.step(dt,{throttle:1,brake:1,nitro:true},road(0),true);
   brakeOnly.step(dt,{throttle:0,brake:1,nitro:false},road(0),true);
   assert.ok(both.u<previous);assert.equal(both.boost,false);assert.equal(both.u,brakeOnly.u);
  }
  assert.ok(both.u<speed-3);
 }
});

test('Six gear RPM rises continuously and shifts without a large artificial sound gap',()=>{
 for(const config of CARS){
  const p=new VehiclePhysics(config);let upshifts=0,reference=0,window=0;
  for(let i=0;i<4800;i++){
   const previous=p.rpm,oldGear=p.gear;p.step(dt,{throttle:1},road(0),true);
   if(p.shiftEvent){assert.equal(p.gear,oldGear+1);upshifts++;reference=previous;window=48;}
   if(window>0){assert.ok(p.rpm>reference*.6,'RPM must not collapse across a normal upshift');window--;}
   assert.ok(p.rpm>=900&&p.rpm<=8000);
  }
  assert.equal(p.gear,6);assert.equal(upshifts,5);
  p.reset();for(let i=0;i<120;i++)p.step(dt,{},road(0),true);
  assert.equal(p.gear,0);assert.equal(p.rpm,900);
 }
});
