import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {VehicleReflections} from '../src/vehicle-reflections.js';
import {renderQuality} from '../src/render-quality.js';
import {refineVehicleMaterial} from '../src/vehicle-materials.js';

function fixture(){
 const log=[],screen={},renderer={coordinateSystem:THREE.WebGLCoordinateSystem,
  shadowMap:{autoUpdate:true,needsUpdate:true},xr:{enabled:true},
  getRenderTarget:()=>screen,getActiveCubeFace:()=>3,getActiveMipmapLevel:()=>1,
  setRenderTarget:(...a)=>log.push(a),render:()=>{}};
 const reflection=new VehicleReflections(renderer);reflection.size=128;
 reflection.cube={texture:{},dispose(){}};reflection.camera=new THREE.CubeCamera(.4,9000,reflection.cube);
 reflection.camera.coordinateSystem=THREE.WebGLCoordinateSystem;reflection.camera.updateCoordinateSystem();
 reflection.pmrem={fromCubemap:()=>({texture:{name:'filtered'},dispose(){}}),dispose(){}};
 const maps=[],bindings=[],car={root:new THREE.Group(),setEnvironment:(texture,options)=>{maps.push(texture);bindings.push({texture,options});}};
 const world={renderBudget:{reflectionSize:128,reflectionInterval:3.2},weather:'clear',night:0,tunnelAmount:0,env:{texture:{name:'shared outdoor HDR'}},scene:new THREE.Scene(),rain:new THREE.Group(),particles:new THREE.Group(),tireEffects:{root:new THREE.Group()},skids:new THREE.Group()};
 world.rain.visible=false;
 return {reflection,renderer,world,car,maps,bindings,log,screen};
}

test('reflection capture publishes only a complete filtered cube and restores render/shadow state',()=>{
 const f=fixture();let captures=0;const receiver=new THREE.Mesh();receiver.receiveShadow=true;f.world.scene.add(receiver);f.renderer.render=()=>{captures++;assert.equal(f.world.tireEffects.root.visible,false);assert.equal(receiver.receiveShadow,false);assert.equal(f.car.root.visible,false);assert.equal(f.renderer.shadowMap.autoUpdate,false);};
 for(let i=0;i<5;i++)f.reflection.update(f.world,f.car,1/60,false);
 assert.equal(captures,5);assert.ok(f.maps.every(map=>map===null),'partial captures never become the active map');assert.equal(f.bindings.at(-1).options.fallbackTexture,f.world.env.texture);
 f.reflection.update(f.world,f.car,1/60,false);
 assert.equal(f.maps.at(-1).name,'filtered');assert.equal(f.reflection.stats.updates,1);
 assert.equal(receiver.receiveShadow,true);assert.equal(f.car.root.visible,true);assert.equal(f.world.rain.visible,false);
 assert.equal(f.renderer.shadowMap.autoUpdate,true);assert.equal(f.renderer.shadowMap.needsUpdate,true);assert.equal(f.renderer.xr.enabled,true);
 assert.deepEqual(f.log.at(-1),[f.screen,3,1]);
 for(let i=0;i<60;i++)f.reflection.update(f.world,f.car,1/60,false);
 assert.equal(captures,6);
 f.reflection.dispose();
});

test('failed reflection capture restores hidden geometry and GPU state',()=>{
 const f=fixture();f.renderer.render=()=>{throw new Error('capture failed');};
 const receiver=new THREE.Mesh();receiver.receiveShadow=true;f.world.scene.add(receiver);
 assert.doesNotThrow(()=>f.reflection.update(f.world,f.car,.1,false));assert.equal(f.reflection.stats.lastError,'capture failed');assert.equal(f.reflection.face,-1);assert.equal(receiver.receiveShadow,true);
 assert.equal(f.car.root.visible,true);assert.equal(f.world.particles.visible,true);assert.equal(f.world.tireEffects.root.visible,true);assert.equal(f.world.rain.visible,false);
 assert.equal(f.renderer.shadowMap.autoUpdate,true);assert.equal(f.renderer.xr.enabled,true);assert.deepEqual(f.log.at(-1),[f.screen,3,1]);
 f.reflection.dispose();
});

test('driver view skips captures and low quality releases maps before disposal',()=>{
 const f=fixture();let captures=0,released=0;f.renderer.render=()=>captures++;
 f.reflection.update(f.world,f.car,.1,true);assert.equal(captures,0);
 for(let i=0;i<6;i++)f.reflection.update(f.world,f.car,.1,false);
 f.reflection.filtered.dispose=()=>{assert.equal(f.maps.at(-1),null);released++;};
 f.world.renderBudget.reflectionSize=0;f.reflection.update(f.world,f.car,.1,false);
 assert.equal(released,1);assert.equal(f.reflection.stats.enabled,false);assert.equal(f.reflection.cube,null);
 f.reflection.dispose();assert.equal(released,1);
 assert.equal(renderQuality('balanced',{coarse:true}).reflectionSize,0);assert.equal(renderQuality('low').reflectionSize,0);
});

test('window glazing remains transparent after refinement without changing opaque mirror material',()=>{
 const glass=new THREE.MeshPhysicalMaterial();glass.name='Window glass';refineVehicleMaterial(glass);
 assert.equal(glass.transparent,true);assert.equal(glass.depthWrite,false);assert.equal(glass.forceSinglePass,true);assert.equal(glass.side,THREE.DoubleSide);assert.equal(glass.transmission,0);
 const shader={fragmentShader:'#include <opaque_fragment>'};glass.onBeforeCompile(shader);
 assert.ok(shader.fragmentShader.includes('glazingReflection / glazingOpacity'));assert.ok(shader.fragmentShader.includes('glazingFresnel'));
 const mirror=new THREE.MeshPhysicalMaterial();mirror.name='Glass';refineVehicleMaterial(mirror);assert.equal(mirror.transparent,false);assert.equal(mirror.depthWrite,true);
 glass.dispose();mirror.dispose();
});


test('filter failure retains the active map, resets the cube face and retries after cooldown',()=>{
 const f=fixture(),active={texture:{name:'previous complete'},dispose(){}};
 f.reflection.filtered=active;f.reflection.elapsed=9;
 f.reflection.pmrem.fromCubemap=()=>{throw new Error('filter failed');};
 for(let i=0;i<6;i++)assert.doesNotThrow(()=>f.reflection.update(f.world,f.car,.1,false));
 assert.equal(f.reflection.filtered,active);assert.equal(f.reflection.face,-1);assert.equal(f.reflection.stats.lastError,'filter failed');
 f.reflection.update(f.world,f.car,.1,false);assert.equal(f.reflection.face,-1);
 f.reflection.pmrem.fromCubemap=()=>({texture:{name:'recovered'},dispose(){}});
 f.reflection.update(f.world,f.car,11,false);assert.equal(f.reflection.face,1);
 for(let i=0;i<5;i++)f.reflection.update(f.world,f.car,.1,false);
 assert.equal(f.maps.at(-1).name,'recovered');assert.equal(f.reflection.pendingFiltered,active);assert.equal(f.reflection.stats.lastError,undefined);
 f.reflection.dispose();
});


test('mobile fallback borrows the existing HDR with night and tunnel attenuation and no capture',()=>{
 const f=fixture();let captures=0,sharedDisposals=0;f.renderer.render=()=>captures++;
 f.world.env.texture.dispose=()=>sharedDisposals++;
 f.world.renderBudget.reflectionSize=0;
 for(const [night,tunnel,expected] of [[0,0,1],[1,0,.27],[0,1,.4],[1,1,.108]]){
  f.world.night=night;f.world.tunnelAmount=tunnel;f.reflection.update(f.world,f.car,.1,false);
  const binding=f.bindings.at(-1);assert.equal(binding.texture,null);assert.equal(binding.options.fallbackTexture,f.world.env.texture);
  assert.ok(Math.abs(binding.options.intensityScale-expected)<1e-12);
 }
 assert.equal(captures,0);assert.equal(f.reflection.stats.updates,0);assert.equal(f.reflection.cube,null);assert.equal(f.reflection.pmrem,null);
 f.reflection.dispose();assert.equal(sharedDisposals,0,'shared world texture is never owned or disposed by the vehicle');
});

test('driver hood gets immediate HDR fallback and retains complete probes without captures',()=>{
 const f=fixture();let captures=0;f.renderer.render=()=>captures++;
 f.reflection.update(f.world,f.car,.1,true);
 assert.equal(f.bindings.at(-1).options.fallbackTexture,f.world.env.texture);assert.equal(f.maps.at(-1),null);
 const complete={texture:{name:'completed exterior'},dispose(){}};f.reflection.filtered=complete;
 f.world.night=1;f.reflection.update(f.world,f.car,.1,true);
 assert.equal(f.maps.at(-1),complete.texture);assert.equal(f.bindings.at(-1).options.intensityScale,1);
 assert.equal(captures,0);f.reflection.dispose();
});

test('capture cooldown still refreshes fallback lighting and quality switch releases local maps first',()=>{
 const f=fixture();f.reflection.update(f.world,f.car,.1,true);
 f.reflection.cooldown=4;f.world.tunnelAmount=1;f.reflection.update(f.world,f.car,.1,false);
 assert.equal(f.maps.at(-1),null);assert.equal(f.bindings.at(-1).options.intensityScale,.4);
 let disposed=0;f.reflection.filtered={texture:{name:'local'},dispose(){assert.equal(f.maps.at(-1),null);disposed++;}};
 f.reflection.face=2;f.reflection.stats.face=2;
 f.world.renderBudget.reflectionSize=0;f.reflection.update(f.world,f.car,.1,true);
 assert.equal(f.reflection.face,-1);assert.equal(f.reflection.stats.face,-1);
 assert.equal(disposed,1);assert.equal(f.bindings.at(-1).options.fallbackTexture,f.world.env.texture);f.reflection.dispose();
});


test('night probe publication has no double attenuation and weather changes start a fresh capture',()=>{
 const f=fixture();let captures=0;f.renderer.render=()=>captures++;f.world.weather='night';f.world.night=1;
 for(let i=0;i<5;i++)f.reflection.update(f.world,f.car,1/60,false);
 assert.equal(f.maps.at(-1),null);assert.ok(Math.abs(f.bindings.at(-1).options.intensityScale-.27)<1e-12);
 f.reflection.update(f.world,f.car,1/60,false);
 assert.equal(f.maps.at(-1).name,'filtered');assert.equal(f.bindings.at(-1).options.intensityScale,1);
 assert.equal(captures,6);assert.equal(f.reflection.stats.updates,1);
 f.world.weather='clear';f.world.night=0;f.reflection.update(f.world,f.car,1/60,false);
 assert.equal(captures,7,'weather change bypasses the stationary/interval reuse gates');assert.equal(f.reflection.face,1);
 for(let i=0;i<5;i++)f.reflection.update(f.world,f.car,1/60,false);
 assert.equal(f.reflection.stats.updates,2);assert.equal(f.bindings.at(-1).options.intensityScale,1);f.reflection.dispose();
});
