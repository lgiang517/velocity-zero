import test from 'node:test';
import assert from 'node:assert/strict';
import {captureVehiclePoses,resolveVehicleContacts,vehicleOverlap,vehicleDimensions} from '../src/vehicle-contacts.js';
const car=(s,d=0,u=0,yaw=0,mass=1540)=>({s,d,u,yaw,v:0,r:0,config:{id:'gt',mass}});
const move=(p,dt)=>{p.s+=(p.u*Math.cos(p.yaw)-p.v*Math.sin(p.yaw))*dt;p.d+=(p.u*Math.sin(p.yaw)+p.v*Math.cos(p.yaw))*dt;p.yaw+=p.r*dt;};
const separated=(a,b)=>assert.ok(vehicleOverlap(a,b)===null||vehicleOverlap(a,b)<.003,`remaining overlap ${vehicleOverlap(a,b)}`);
function step(cars,dt=1/120){const previous=captureVehiclePoses(cars);for(const e of cars)move(e.p||e,dt);return resolveVehicleContacts(cars,{previous,dt});}
test('rear impact transfers momentum without overlap',()=>{const a=car(0,0,35),b=car(4.7,0,10);const impacts=step([a,b]);separated(a,b);assert.ok(a.u<35&&b.u>10);assert.ok(Math.abs(a.u+b.u-45)<1e-8);assert.ok(impacts.length);assert.ok(Math.abs(a.r)<1e-8);});
test('head-on 200 km/h each never exchanges sides',()=>{const a=car(0,0,200/3.6),b=car(5,0,200/3.6,Math.PI);step([a,b]);separated(a,b);assert.ok(a.s<b.s);assert.ok(a.u<2&&b.u<2);});
test('swept contact catches full pass-through during a delayed step',()=>{const a=car(0,0,200/3.6),b=car(10,0,200/3.6,Math.PI);const impacts=step([a,b],.2);separated(a,b);assert.ok(a.s<b.s);assert.ok(impacts.length);});
test('side scraping separates and damps lateral closing velocity',()=>{const a=car(0,0,30),b=car(.4,2.1,28);a.v=3;resolveVehicleContacts([a,b]);separated(a,b);assert.ok(a.v<3);assert.ok(a.u>25);});
test('angled impact stays finite and creates rotational response',()=>{const a=car(0,0,35,.3),b=car(4,1,12);resolveVehicleContacts([a,b]);separated(a,b);assert.ok(Math.abs(a.r)+Math.abs(b.r)>.01);for(const v of [a,b])assert.ok([v.s,v.d,v.u,v.v,v.r].every(Number.isFinite));});
test('heavier car changes velocity less',()=>{const a=car(0,0,30,0,2000),b=car(4.5,0,0,0,1000);resolveVehicleContacts([a,b]);assert.ok(Math.abs((30-a.u)*2-b.u)<1e-8);separated(a,b);});
test('sustained pushing kinematic traffic never penetrates it',()=>{const a=car(0,0,30),b=car(4.7,0,15);for(let i=0;i<600;i++){a.u+=.2;step([a,{p:b,kinematic:true}]);separated(a,b);assert.ok(a.s<b.s);}assert.equal(b.u,15);});
test('three-car queue resolves simultaneous contacts',()=>{const cars=[car(0,0,40),car(4.4,0,10),car(8.8,0,0)];for(let i=0;i<20;i++)step(cars);separated(cars[0],cars[1]);separated(cars[1],cars[2]);assert.ok(cars[0].s<cars[1].s&&cars[1].s<cars[2].s);});
test('body dimensions follow car appearance variants',()=>{const p=car(0);p.config.id='light';assert.equal(vehicleDimensions(p).length,4.663*.95);assert.equal(vehicleDimensions(p).width,2.272*.96);});
