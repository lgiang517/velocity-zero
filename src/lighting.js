import {CSM} from 'three/addons/csm/CSM.js';
import * as THREE from 'three';

/** One sun direction shared by the sky, water and three stable shadow cascades. */
export class SunShadows {
 constructor(world){
  this.world=world;this.materials=new WeakSet();this.lastProjection='';
  world.scene.remove(world.sun,world.sun.target);
  this.csm=new CSM({camera:world.camera,parent:world.scene,cascades:3,maxFar:420,mode:'custom',customSplitsCallback:(_n,_near,far,target)=>target.push(28/far,110/far,1),shadowMapSize:2048,shadowBias:-.00008,lightDirection:world.uniforms.sunDir.value.clone().negate(),lightIntensity:3.3,lightMargin:420,lightNear:1,lightFar:1400});
  this.csm.fade=true;this.csm.updateFrustums();
  for(const light of this.csm.lights){light.shadow.normalBias=.022;light.shadow.radius=2;}
  this.prepare(world.scene);
 }
 prepare(root){root.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){
  if(!(m.isMeshStandardMaterial||m.isMeshPhysicalMaterial||m.isMeshPhongMaterial)||this.materials.has(m))continue;
  const original=m.onBeforeCompile,cacheKey=m.customProgramCacheKey.call(m);this.csm.setupMaterial(m);const csmCompile=m.onBeforeCompile;
  m.onBeforeCompile=function(shader,renderer){original.call(this,shader,renderer);csmCompile.call(this,shader,renderer);};
  m.customProgramCacheKey=()=>cacheKey+'|sun-csm-3';m.needsUpdate=true;this.materials.add(m);
  m.addEventListener('dispose',()=>this.csm.shaders.delete(m));
 }});}
 update(){
  const w=this.world,azimuth=Math.atan2(-.56,.77)+w.time*.00055;
  const elevation=(w.weather==='clear'?.68:w.weather==='dynamic'?.28+(1-w.night)*.28:.34)+Math.sin(w.time*.0012)*.028;
  w.uniforms.sunDir.value.set(Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation),Math.cos(azimuth)*Math.cos(elevation));
  this.csm.lightDirection.copy(w.uniforms.sunDir.value).negate();
  for(const light of this.csm.lights){light.color.copy(w.sun.color);light.intensity=w.sun.intensity;}
  const projection=w.camera.fov+':'+w.camera.aspect;if(projection!==this.lastProjection){this.csm.updateFrustums();this.lastProjection=projection;}
  w.camera.updateMatrixWorld();this.csm.update();
 }
}
