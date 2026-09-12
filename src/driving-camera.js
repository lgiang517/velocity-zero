import * as THREE from 'three';
import {clamp,damp} from './physics.js';
const UP=new THREE.Vector3(0,1,0);
const angleDifference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));

/** Two camera rigs. The cockpit is rigidly attached; orbit follows an interpolated car pose. */
export class DrivingCamera {
 constructor(camera){this.camera=camera;this.orbit={yaw:0,pitch:.33,distance:8.5};this.initialized=false;this.lastMode=-1;this.heading=0;this.height=0;}
 reset(){this.initialized=false;}
 resetOrbit(){Object.assign(this.orbit,{yaw:0,pitch:.33,distance:8.5});this.reset();}
 drag(dx,dy){this.orbit.yaw-=dx*.006;this.orbit.pitch=clamp(this.orbit.pitch+dy*.004,.12,1.15);}
 zoom(delta){this.orbit.distance=clamp(this.orbit.distance+delta*.008,5.5,17);}
 update(dt,car,player,road,mode,view,groundHeight){
  const camera=this.camera,pos=car.root.position,heading=road.heading+player.yaw;
  const reset=!this.initialized||this.lastMode!==view;
  const eye=new THREE.Vector3(),aim=new THREE.Vector3();let fov=camera.aspect<.8?70:58;
  car.body.visible=true;car.setInterior(view===1&&mode!=='menu');
  if(mode==='menu'){
   const orbit=Math.sin(player.s*.001)*.02,angle=road.heading+.82+orbit;
   eye.copy(pos).add(new THREE.Vector3(Math.sin(angle)*9,3.25,-Math.cos(angle)*9));
   aim.copy(pos).add(new THREE.Vector3(0,.8,0)).addScaledVector(road.right,innerWidth>900?-2.3:-.4).addScaledVector(road.tan,2.7);fov=46;
  }else if(view===1){
   // Transform both eye and gaze through the same chassis frame, including road grade.
   car.root.updateMatrixWorld(true);
   eye.set(.35,1.03,-.40).applyMatrix4(car.root.matrixWorld);
   aim.set(.35,1.03,32).applyMatrix4(car.root.matrixWorld);fov=camera.aspect<.8?82:67;
  }else{
   this.heading=reset?heading:this.heading+angleDifference(heading,this.heading)*(1-Math.exp(-7*dt));
   const azimuth=this.heading+Math.PI+this.orbit.yaw,r=this.orbit.distance;
   const horizontal=r*Math.cos(this.orbit.pitch);
   eye.copy(pos).add(new THREE.Vector3(Math.sin(azimuth)*horizontal,.85+r*Math.sin(this.orbit.pitch),Math.cos(azimuth)*horizontal));
   const minY=groundHeight(eye.x,eye.z)+.70;
   const desiredY=Math.max(eye.y,minY);
   this.height=reset?desiredY:damp(this.height,desiredY,14,dt);
   eye.y=Math.max(this.height,minY);
   const lookForward=1.6*Math.max(0,Math.cos(this.orbit.yaw));
   aim.copy(pos).add(new THREE.Vector3(Math.sin(heading)*lookForward,.82,Math.cos(heading)*lookForward));
  }
  // Do not interpolate world-space position again: that introduces acceleration lag/jitter.
  camera.position.copy(eye);camera.up.copy(UP);camera.lookAt(aim);camera.fov=fov;camera.updateProjectionMatrix();
  this.initialized=true;this.lastMode=view;
 }
}

export function renderPose(current,previous,alpha){
 if(!previous)return current;
 const pose={...current},t=clamp(alpha,0,1);
 for(const key of['s','d','u','v','steer','roll','pitch'])pose[key]=previous[key]+(current[key]-previous[key])*t;
 pose.yaw=previous.yaw+angleDifference(current.yaw,previous.yaw)*t;
 return pose;
}
export const snapshotPose=p=>Object.fromEntries(['s','d','u','v','steer','roll','pitch','yaw'].map(k=>[k,p[k]]));
