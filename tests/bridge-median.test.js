import test from 'node:test';
import assert from 'node:assert/strict';
import {VehiclePhysics,DriverAI,CARS} from '../src/physics.js';
import {CoastTrack} from '../src/track.js';
import {lateralExtent} from '../src/road-boundaries.js';

test('cars cannot tunnel through central tower protection on either carriageway',()=>{
 for(const config of CARS)for(const side of[-1,1]){
  const p=new VehiclePhysics(config);p.reset(0,side*3.4);p.u=25;p.v=-side*9;
  for(let n=0;n<120;n++){p.step(1/120,{steer:-side,throttle:.2},{curvature:0,slope:0,wet:0,medianHalfWidth:1.35});assert.ok(side*p.d>=1.35+.09+lateralExtent(config,p.yaw)-1e-8);}
  assert.equal(p.medianSide,side);assert.ok(p.collisions>0);
 }
});
test('median response preserves steering away and does not affect ordinary roads',()=>{
 const p=new VehiclePhysics(CARS[0]);p.reset(0,-2);p.u=12;p.v=-2;
 p.resolveMedian(1.35,0,1/120,-1);assert.ok(p.v<0);assert.equal(p.collisions,0);
 const before={d:p.d,u:p.u,v:p.v};p.resolveMedian(0);assert.deepEqual({d:p.d,u:p.u,v:p.v},before);assert.equal(p.medianSide,0);
});
test('AI overtaking remains on its own side before and inside a bridge median',()=>{
 const track=new CoastTrack(),s=track.sectionS('hzmb',.3);
 for(const side of[-1,1]){const p=new VehiclePhysics(CARS[0]);p.reset(s,side*3.5);p.u=22;const front=new VehiclePhysics(CARS[0]);front.reset(s+12,side*3.5);front.u=18;const ai=new DriverAI(p,'precision');ai.lane=side*3.5;
  for(let n=0;n<180;n++){const input=ai.controls(track,front,[p,front],n/120),q=track.sample(p.s);p.step(1/120,input,{...q,wet:0});assert.equal(Math.sign(p.d),side);}
 }
});
