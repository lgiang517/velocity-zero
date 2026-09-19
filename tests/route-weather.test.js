import test from 'node:test';
import assert from 'node:assert/strict';
import {CoastTrack} from '../src/track.js';
import {sampleRouteWeather,ROUTE_WEATHER_TUNING} from '../src/route-weather.js';
const track=new CoastTrack(),section=track.section('duku'),at=(p,base='clear',time=0)=>sampleRouteWeather(track,track.sectionS('duku',p),base,time);
const numeric=['weight','cloud','wet','fog','snow','rain','night','daylightScale','temperature'];

test('every default weather mode receives mountain weather on the real Duku section',()=>{
 for(const mode of ['clear','sunset','night','rain','storm','fog','dynamic']){const peak=at(.56,mode);assert.equal(peak.active,true);assert.equal(peak.stage,'sleet');assert.ok(peak.snow>.6);assert.ok(peak.weight>.99);}
 assert.equal(at(.02).stage,'valley');assert.equal(at(.32).stage,'mist');assert.equal(at(.87).stage,'clearing');
 const valley=at(.04),mist=at(.36),peak=at(.56),descent=at(.94);
 assert.ok(mist.cloud>valley.cloud+.4);assert.ok(mist.fog>valley.fog*2);assert.ok(peak.wet>.4&&peak.wet<=.48);assert.ok(peak.temperature<3);assert.ok(descent.wet<.01&&descent.snow===0);
});

test('entry and exit use at least 150m smooth transitions and exact base restoration',()=>{
 const start=sampleRouteWeather(track,section.startS,'clear'),end=sampleRouteWeather(track,section.endS,'clear');
 assert.equal(start.weight,0);assert.equal(end.weight,0);assert.equal(start.active,false);assert.equal(end.active,false);assert.ok(start.transitionMetres>=150);
 for(const station of [section.startS-1,section.endS+1,0,track.length-1]){const state=sampleRouteWeather(track,station,'rain');assert.equal(state.active,false);assert.equal(state.weight,0);assert.equal(state.wet,.7);assert.equal(state.snow,0);assert.equal(state.daylightScale,1);}
 for(const station of [section.startS,section.endS]){const left=sampleRouteWeather(track,station-.01,'clear'),right=sampleRouteWeather(track,station+.01,'clear');for(const key of numeric)assert.ok(Math.abs(left[key]-right[key])<.00001,`${key} jumps at ${station}`);}
});

test('continuous target changes bound grip and visibility shifts along the route',()=>{
 let previous=sampleRouteWeather(track,section.startS-1,'clear',30);
 for(let s=section.startS;s<section.endS+1;s+=1){const state=sampleRouteWeather(track,s,'clear',30);assert.ok(Math.abs(state.wet-previous.wet)<.003);assert.ok(Math.abs(state.snow-previous.snow)<.008);assert.ok(Math.abs(state.fog-previous.fog)<.00003);assert.ok(Math.abs(state.temperature-previous.temperature)<.08);previous=state;}
 assert.ok(ROUTE_WEATHER_TUNING.maxMountainWet<.7,'mountain rain alone must not enable the aquaplaning threshold');
});

test('manual night, rain, storm and fog choices remain authoritative through and after Duku',()=>{
 for(let p=0;p<=1;p+=.01){assert.equal(at(p,'night',110).night,1);assert.ok(at(p,'rain').wet>=.7);assert.equal(at(p,'storm').wet,1);assert.equal(at(p,'storm').night,.55);assert.ok(at(p,'storm').cloud>=.95);assert.ok(at(p,'fog').fog>=.004);}
 for(const mode of ['night','rain','storm','fog']){const before=sampleRouteWeather(track,section.startS-5,mode,40),after=sampleRouteWeather(track,section.endS+5,mode,40);for(const key of numeric)assert.equal(before[key],after[key],`${mode} ${key}`);}
 const explicit=at(.56,{mode:'night',wet:.82,night:.9,fog:.005,cloud:.98,temperature:-5});assert.equal(explicit.night,.9);assert.ok(explicit.wet>=.82);assert.ok(explicit.fog>=.005);assert.ok(explicit.cloud>=.98);assert.equal(explicit.temperature,-5);
});

test('time drift is slow, deterministic and freezes when simulation time freezes',()=>{
 const one=at(.56,'clear',123),two=at(.56,'clear',123);assert.deepEqual(one,two);
 for(let time=0;time<400;time+=1){const a=at(.56,'clear',time),b=at(.56,'clear',time+1/60);for(const key of ['wet','snow','cloud'])assert.ok(Math.abs(a[key]-b[key])<.0001);assert.ok(a.fog<=.00265);assert.ok(a.daylightScale>=.68&&a.daylightScale<=1);}
});

test('lap wrapping, reverse travel and absent Duku sections return safe pure values',()=>{
 const s=track.sectionS('duku',.57),first=sampleRouteWeather(track,s,'clear',55),later=sampleRouteWeather(track,s+track.length*2,'clear',55);for(const key of numeric)assert.ok(Math.abs(first[key]-later[key])<1e-9);assert.equal(first.label,later.label);
 for(const mode of ['clear','sunset','dynamic'])for(const input of [null,{}, {length:1},new CoastTrack({legacy:true})]){const result=sampleRouteWeather(input,100,mode,0);assert.equal(result.weight,0);for(const key of numeric)assert.ok(Number.isFinite(result[key]));}
 const positions=Array.from({length:21},(_,i)=>i/20),forward=positions.map(p=>at(p,'sunset',0)),backward=[...positions].reverse().map(p=>at(p,'sunset',0));assert.deepEqual(backward,[...forward].reverse());assert.equal(backward.at(-1).weight,0);assert.equal(sampleRouteWeather(track,section.startS-10,'sunset').snow,0);
 assert.equal(sampleRouteWeather(track,NaN,'clear').active,false);
});
