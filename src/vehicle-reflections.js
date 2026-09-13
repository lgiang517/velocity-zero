import * as THREE from 'three';

/** One cube face per frame; a finished cube is filtered before the car uses it. */
export class VehicleReflections {
 constructor(renderer){
  this.renderer=renderer;this.size=0;this.face=-1;this.elapsed=Infinity;this.car=null;this.cooldown=0;
  this.lastPosition=new THREE.Vector3(Infinity,Infinity,Infinity);this.weather='';
  this.stats={enabled:false,size:0,updates:0,face:-1};
 }
 configure(size){
  if(size===this.size)return;
  this.release();this.size=size;this.stats.size=size;this.stats.enabled=size>0;
  if(!size)return;
  this.cube=new THREE.WebGLCubeRenderTarget(size,{type:THREE.HalfFloatType,generateMipmaps:false,minFilter:THREE.LinearFilter,depthBuffer:true});
  this.camera=new THREE.CubeCamera(.4,9000,this.cube);
  this.camera.coordinateSystem=this.renderer.coordinateSystem;this.camera.updateCoordinateSystem();
  this.pmrem=new THREE.PMREMGenerator(this.renderer);this.pmrem.compileCubemapShader();
 }
 update(world,car,dt,inside){
  this.configure(world.renderBudget.reflectionSize);
  if(this.car!==car){this.car?.setEnvironment(null);this.car=car;this.face=-1;this.elapsed=Infinity;}
  if(!this.size){car.setEnvironment(null);return;}
  this.elapsed+=dt;this.cooldown=Math.max(0,this.cooldown-dt);
  if(this.cooldown>0)return;
  // The driver's hood keeps the last complete probe, with no capture overhead inside.
  if(inside)return;
  if(this.face<0){
   const moved=this.lastPosition.distanceToSquared(car.root.position)>16;
   const changed=world.weather!==this.weather;
   if(this.filtered && !changed && this.elapsed<world.renderBudget.reflectionInterval)return;
   if(this.filtered && !changed && !moved && this.elapsed<8)return;
   this.camera.position.copy(car.root.position);this.camera.position.y+=1.1;
   this.camera.updateMatrixWorld(true);this.lastPosition.copy(car.root.position);
   this.face=0;this.elapsed=0;this.weather=world.weather;
  }
  const renderer=this.renderer,target=renderer.getRenderTarget(),activeFace=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();
  const shadowAuto=renderer.shadowMap.autoUpdate,shadowNeeds=renderer.shadowMap.needsUpdate,xr=renderer.xr.enabled;
  const hidden=[car.root,world.rain,world.particles,world.skids].filter(Boolean).map(object=>[object,object.visible]);
  const receivers=[];
  try{
   // Main-camera CSM splits do not apply to the six reflection views.
   world.scene.traverse(object=>{if(object.isMesh&&object.receiveShadow){receivers.push(object);object.receiveShadow=false;}});
   for(const [object]of hidden)object.visible=false;
   renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;renderer.xr.enabled=false;
   renderer.setRenderTarget(this.cube,this.face);renderer.render(world.scene,this.camera.children[this.face]);
   this.face++;
   if(this.face===6){
    const next=this.pmrem.fromCubemap(this.cube.texture,this.pendingFiltered);
    this.pendingFiltered=this.filtered;this.filtered=next;
    car.setEnvironment(this.filtered.texture);this.face=-1;this.stats.updates++;delete this.stats.lastError;
   }
  }catch(error){
   // A failed optional probe cannot stop the driving loop. Keep the last complete map.
   this.face=-1;this.elapsed=0;this.cooldown=10;this.stats.lastError=String(error?.message||error);
   console.warn('Vehicle reflection capture deferred:',this.stats.lastError);
  }finally{
   for(const object of receivers)object.receiveShadow=true;
   for(const [object,visible]of hidden)object.visible=visible;
   renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowNeeds;renderer.xr.enabled=xr;
   renderer.setRenderTarget(target,activeFace,mip);this.stats.face=this.face;
  }
 }
 release(){
  this.car?.setEnvironment(null);this.cube?.dispose();this.filtered?.dispose();this.pendingFiltered?.dispose();this.pmrem?.dispose();
  this.cube=null;this.filtered=null;this.pendingFiltered=null;this.pmrem=null;this.face=-1;this.elapsed=Infinity;
 }
 dispose(){this.release();this.car=null;}
}
