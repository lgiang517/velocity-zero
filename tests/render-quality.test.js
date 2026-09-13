import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {renderQuality,setComposerSamples} from '../src/render-quality.js';
import {QualityBloomPass} from '../src/quality-bloom.js';
import {SunShadows} from '../src/lighting.js';

test('touch balanced respects 1x and materially reduces shadow/sample budgets',()=>{
 const balanced=renderQuality('balanced',{coarse:true,dpr:3,maxSamples:4}),high=renderQuality('high',{coarse:true,dpr:3});
 assert.equal(balanced.pixelRatio,1);assert.equal(balanced.samples,2);
 assert.ok(balanced.shadowSize**2<=2048**2/4);assert.ok(balanced.shadowFar<high.shadowFar);
 const low=renderQuality('low',{dpr:3});assert.equal(low.samples,0);assert.equal(low.shadowSize,0);assert.equal(low.bloomScale,0);
 assert.equal(renderQuality('unexpected').name,'balanced');assert.equal(renderQuality('high',{maxSamples:0}).samples,0);
});

test('MSAA changes dispose both existing attachments even without a viewport resize',()=>{
 const composer={renderTarget1:new THREE.WebGLRenderTarget(32,32,{samples:4}),renderTarget2:new THREE.WebGLRenderTarget(32,32,{samples:4})};let disposals=0;
 for(const target of Object.values(composer))target.addEventListener('dispose',()=>disposals++);
 setComposerSamples(composer,2);assert.equal(disposals,2);assert.equal(composer.renderTarget2.samples,2);
 setComposerSamples(composer,2);assert.equal(disposals,2);
});

test('balanced bloom remains quarter viewport dimensions at first mip across resize',()=>{
 const pass=new QualityBloomPass(new THREE.Vector2(800,600),.18,.35,1.2);
 pass.resolutionScale=.5;pass.setSize(1200,800);assert.equal(pass.renderTargetBright.width,300);assert.equal(pass.renderTargetBright.height,200);
 pass.setSize(800,1200);assert.equal(pass.renderTargetBright.width,200);assert.equal(pass.renderTargetBright.height,300);
 pass.resolutionScale=1;pass.setSize(800,600);assert.equal(pass.renderTargetBright.width,400);pass.dispose();
});

test('CSM quality switching releases maps, retains material customization and updates actual frustums',()=>{
 const world={quality:'balanced',scene:new THREE.Scene(),sun:new THREE.DirectionalLight(),camera:new THREE.PerspectiveCamera(48,1.5,.1,9000),uniforms:{sunDir:{value:new THREE.Vector3(-.56,.32,.77).normalize()}}};
 let customCalls=0;const material=new THREE.MeshStandardMaterial();material.onBeforeCompile=()=>customCalls++;
 world.scene.add(new THREE.Mesh(new THREE.BoxGeometry(),material));const shadows=new SunShadows(world);
 let released=0;for(const light of shadows.csm.lights){light.shadow.map=new THREE.WebGLRenderTarget(16,16);light.shadow.map.addEventListener('dispose',()=>released++);}
 shadows.setQuality(renderQuality('balanced',{coarse:true}));assert.equal(released,3);assert.equal(shadows.csm.maxFar,220);
 assert.equal(shadows.csm.breaks[0],18/220);for(const light of shadows.csm.lights)assert.equal(light.shadow.mapSize.x,768);
 const shader={uniforms:{}};material.onBeforeCompile(shader,{});assert.equal(customCalls,1);assert.equal(shader.uniforms.shadowFar.value,220);
 shadows.setQuality(renderQuality('high'));assert.equal(shader.uniforms.shadowFar.value,420);assert.equal(shadows.csm.shadowMapSize,2048);
 shadows.setQuality(renderQuality('low'));for(const light of shadows.csm.lights)assert.equal(light.shadow.map,null);
 world.renderer={shadowMap:{enabled:false}};world.time=0;world.night=0;world.weather='clear';shadows.update();
 for(const light of shadows.csm.lights)assert.ok(light.position.distanceTo(light.target.position)>.99);
 shadows.csm.remove();shadows.csm.dispose();material.dispose();
});
