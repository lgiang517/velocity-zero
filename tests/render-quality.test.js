import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {renderQuality,setComposerSamples,MobileResolution} from '../src/render-quality.js';
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


test('large touch displays cap total pixels without changing desktop quality',()=>{
 for(const quality of ['low','balanced','high']){
  const budget=renderQuality(quality,{coarse:true,dpr:3,width:1366,height:1024});
  assert.ok(1366*1024*budget.pixelRatio**2<=({low:600000,balanced:900000,high:1400000}[quality])+1);
 }
 assert.equal(renderQuality('high',{dpr:3,width:3840,height:2160}).pixelRatio,2);
});

test('sustained mobile load scales down with a floor; healthy frames do not oscillate',()=>{
 const q=new MobileResolution();let changes=0;
 for(let i=0;i<600;i++)changes+=Number(q.sample(1/30,true));
 assert.equal(changes,2);assert.equal(q.scale,.72);
 for(let i=0;i<900;i++)assert.equal(q.sample(1/60,true),false);
 assert.equal(q.scale,.72);q.reset();assert.equal(q.scale,1);
});

test('mobile resolution ignores background gaps, isolated hitches and inactive screens',()=>{
 const q=new MobileResolution();
 for(let i=0;i<600;i++)q.sample(1/60,true);
 q.sample(.12,true);q.sample(5,true);
 for(let i=0;i<600;i++)q.sample(1/30,false);
 assert.equal(q.scale,1);
 for(let i=0;i<100;i++)q.sample(1/60,true);
 assert.equal(q.scale,1);
});
