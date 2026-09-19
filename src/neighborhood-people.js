import * as THREE from 'three';

const MAX_PEOPLE=24,PARTS=20,UP=new THREE.Vector3(0,1,0);
const rand=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
const smooth=x=>{x=THREE.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
const shirts=['#70848a','#ada290','#786f60','#566b65','#aa7867','#424c61','#a2a49a'];
const trousers=['#343c48','#515956','#60564a','#303d49'];
const skins=['#ca9c79','#b77f59','#8e5f43','#d7b192','#ad7556'];
const hairs=['#302822','#47392c','#736753','#252626'];

export function neighborhoodPeopleBudget(quality='balanced',coarse=false){
 const name=typeof quality==='string'?quality:quality?.name||'balanced';
 if(name==='low')return {count:6,distance:85,shadows:false};
 return {count:coarse?12:name==='high'?24:18,distance:coarse?125:name==='high'?210:165,shadows:name==='high'&&!coarse};
}

// The route owns ground height and road clearance. People interpolate only this
// validated pavement; no independent terrain estimate can send them into traffic.
function prepareRoute(source,index){
 const points=[];
 for(const p of source?.points||[]){
  if(!Number.isFinite(p.x+p.y+p.z))return null;
  if(!points.length||points.at(-1).distanceToSquared(p)>1e-8)points.push(p.clone());
 }
 if(points.length<2)return null;
 const cumulative=[0],directions=[];
 for(let i=1;i<points.length;i++)cumulative.push(cumulative.at(-1)+points[i].distanceTo(points[i-1]));
 if(cumulative.at(-1)<4)return null;
 for(let i=0;i<points.length;i++){
  const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
  directions.push(new THREE.Vector3(b.x-a.x,0,b.z-a.z).normalize());
 }
 return {index,points,cumulative,directions,length:cumulative.at(-1)};
}
function sample(route,distance,position,direction){
 let i=0;while(i<route.points.length-2&&route.cumulative[i+1]<distance)i++;
 const t=THREE.MathUtils.clamp((distance-route.cumulative[i])/(route.cumulative[i+1]-route.cumulative[i]),0,1);
 position.lerpVectors(route.points[i],route.points[i+1],t);
 direction.lerpVectors(route.directions[i],route.directions[i+1],t).normalize();
}
function motion(person,time){
 const {route,speed,wait}=person,ramp=.8,travel=route.length/speed+ramp,half=travel+wait;
 const phase=((time+person.offset)%(half*2)+half*2)%(half*2),reverse=phase>=half,t=phase%half;
 let distance,moving,turn=0;
 if(t<travel){
  distance=t<ramp?.5*speed*t*t/ramp:t>travel-ramp?route.length-.5*speed*(travel-t)**2/ramp:speed*(t-ramp*.5);
  moving=Math.min(1,t/ramp,(travel-t)/ramp);
 }else{distance=route.length;moving=0;turn=smooth((t-travel-.25)/Math.max(.5,wait-.5));}
 sample(route,reverse?route.length-distance:distance,person.position,person.direction);
 // A 20 cm passing lane leaves the entire body within the paved corridor.
 const lane=.20*(reverse?-1:1)*(1-2*turn);
 person.position.x+=person.direction.z*lane;person.position.z-=person.direction.x*lane;
 person.yaw=Math.atan2(person.direction.x,person.direction.z)+(reverse?Math.PI:0)+turn*Math.PI;
 person.moving=moving;person.phase=(time+person.offset)*speed*7.6;
}

/** Two instanced draws for the entire near crowd: bodies and contact shadows.
 * No textures, lights, animation mixers or independent requestAnimationFrame.
 */
export function buildNeighborhoodPeople(world,paths){
 const routes=(paths?.routes||[]).map(prepareRoute).filter(Boolean),people=[];
 for(const route of routes){
  const count=Math.min(36,Math.max(1,Math.ceil(route.length/45)));
  for(let j=0;j<count&&people.length<96;j++){
   const seed=route.index*31+j*17+6,speed=.72+rand(seed+1)*.34,wait=2.8+rand(seed+2)*2.2;
   const cycle=2*(route.length/speed+.8+wait);
   people.push({id:people.length,route,speed,wait,offset:cycle*((j+.3)/count)+rand(seed+3)*2,
    scale:.93+rand(seed+4)*.12,position:new THREE.Vector3(),direction:new THREE.Vector3(),yaw:0,moving:0,phase:0,distance:0,
    colors:{shirt:new THREE.Color(shirts[seed%shirts.length]),pants:new THREE.Color(trousers[seed%trousers.length]),skin:new THREE.Color(skins[seed%skins.length]),hair:new THREE.Color(hairs[seed%hairs.length]),shoe:new THREE.Color('#34312e'),bag:new THREE.Color('#6f5a44')},
    bag:seed%4===0,backpack:seed%5===0});
  }
 }
 const geometry=new THREE.CapsuleGeometry(1,1,2,6);geometry.scale(1,2/3,1);
 const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.91,metalness:0,envMapIntensity:.18});
 const bodies=new THREE.InstancedMesh(geometry,material,MAX_PEOPLE*PARTS);
 bodies.name='Neighborhood residents';bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);bodies.frustumCulled=false;bodies.receiveShadow=true;bodies.count=0;
 // Tiny grounded ovals remain useful when mobile/low avoids pedestrian shadow casters.
 const shadowGeometry=new THREE.CircleGeometry(1,10);shadowGeometry.rotateX(-Math.PI/2);
 const shadowMaterial=new THREE.MeshBasicMaterial({color:'#1b231d',transparent:true,opacity:.19,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
 const shadows=new THREE.InstancedMesh(shadowGeometry,shadowMaterial,MAX_PEOPLE);
 shadows.name='Resident contact shadows';shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);shadows.frustumCulled=false;shadows.count=0;
 world.scene.add(bodies,shadows);
 const dummy=new THREE.Object3D(),a=new THREE.Vector3(),b=new THREE.Vector3(),delta=new THREE.Vector3(),rotation=new THREE.Quaternion(),yawRotation=new THREE.Quaternion();
 const slots=new Int16Array(MAX_PEOPLE).fill(-1),near=[];
 const stats={routes:routes.length,residents:people.length,active:0,maxActive:0,drawCalls:0,triangles:0,matrixUpdates:0,shadowCasters:false};
 let disposed=false;
 function draw(person,slot){
  const base=slot*PARTS,c=Math.cos(person.yaw),s=Math.sin(person.yaw),scale=person.scale,colors=person.colors,changeColor=slots[slot]!==person.id;
  slots[slot]=person.id;let partIndex=0;
  function part(x,y,z,w,h,d,color,pitch=0){
   dummy.position.set(person.position.x+(x*c+z*s)*scale,person.position.y+y*scale,person.position.z+(-x*s+z*c)*scale);
   dummy.rotation.set(pitch,person.yaw,0,'YXZ');dummy.scale.set(w*scale,h*scale,d*scale);dummy.updateMatrix();
   bodies.setMatrixAt(base+partIndex,dummy.matrix);if(changeColor)bodies.setColorAt(base+partIndex,color);partIndex++;
  }
  function limb(from,to,radius,color){
   delta.subVectors(to,from);const length=delta.length();rotation.setFromUnitVectors(UP,delta.multiplyScalar(1/length));
   yawRotation.setFromAxisAngle(UP,person.yaw);rotation.premultiply(yawRotation);
   const x=(from.x+to.x)/2,y=(from.y+to.y)/2,z=(from.z+to.z)/2;
   dummy.position.set(person.position.x+(x*c+z*s)*scale,person.position.y+y*scale,person.position.z+(-x*s+z*c)*scale);
   dummy.quaternion.copy(rotation);dummy.scale.set(radius*scale,length*.57*scale,radius*scale);dummy.updateMatrix();
   bodies.setMatrixAt(base+partIndex,dummy.matrix);if(changeColor)bodies.setColorAt(base+partIndex,color);partIndex++;
  }
  const gait=person.moving,bounce=Math.abs(Math.sin(person.phase))*.012*gait;
  part(0,1.20+bounce,0,.205,.255,.117,colors.shirt,-.035*gait);
  part(0,.91+bounce,0,.17,.15,.102,colors.pants);
  part(0,1.455+bounce,.004,.064,.065,.060,colors.skin);
  part(0,1.603+bounce,.011,.099,.129,.088,colors.skin);
  part(0,1.693+bounce,-.008,.105,.074,.092,colors.hair);
  part(0,1.603+bounce,.100,.024,.029,.028,colors.skin);
  for(const side of [-1,1]){
   const p=person.phase+(side<0?Math.PI:0),swing=Math.sin(p)*gait,lift=Math.max(0,Math.cos(p))*gait;
   const footZ=.19*swing,footY=.039+.073*lift;
   a.set(side*.102,.90+bounce,0);b.set(side*.112,.49+.035*lift,footZ*.48+.025);limb(a,b,.082,colors.pants);
   a.copy(b);b.set(side*.114,footY+.06,footZ);limb(a,b,.060,colors.pants);
   part(side*.114,footY,footZ+.045,.075,.04,.139,colors.shoe);
  }
  for(const side of [-1,1]){
   const swing=Math.sin(person.phase+(side<0?0:Math.PI))*.12*gait;
   a.set(side*.215,1.385+bounce,0);b.set(side*.256,1.125+bounce,swing*.5);limb(a,b,.065,colors.shirt);
   a.copy(b);b.set(side*.255,.93+bounce,swing);limb(a,b,.046,colors.skin);
   part(side*.255,.903+bounce,swing,.044,.058,.041,colors.skin);
  }
  part(-.30,.735+bounce,0,person.bag?.095:.0001,person.bag?.14:.0001,person.bag?.055:.0001,colors.bag);
  part(0,1.24+bounce,-.135,person.backpack?.15:.0001,person.backpack?.19:.0001,person.backpack?.075:.0001,colors.bag);
  dummy.position.copy(person.position);dummy.position.y+=.012;dummy.rotation.set(0,person.yaw,0);dummy.scale.set(.27*scale,1,.18*scale);dummy.updateMatrix();shadows.setMatrixAt(slot,dummy.matrix);
  return changeColor;
 }
 function update(camera,time=world.time||0,quality=world.quality||'balanced'){
  if(disposed)return;
  const coarse=typeof quality==='object'&&quality?.coarse!==undefined?quality.coarse:world.coarsePointer??(typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches);
  const budget=neighborhoodPeopleBudget(quality,coarse),origin=camera?.position;
  near.length=0;
  if(origin&&Number.isFinite(time))for(const person of people){
   motion(person,time);person.distance=person.position.distanceToSquared(origin);
   if(person.distance<budget.distance**2)near.push(person);
  }
  near.sort((a,b)=>a.distance-b.distance);near.length=Math.min(near.length,budget.count);
  let colorsChanged=false;for(let slot=0;slot<near.length;slot++)colorsChanged=draw(near[slot],slot)||colorsChanged;
  bodies.count=near.length*PARTS;shadows.count=near.length;bodies.visible=shadows.visible=near.length>0;
  bodies.castShadow=budget.shadows;
  if(near.length){bodies.instanceMatrix.needsUpdate=true;shadows.instanceMatrix.needsUpdate=true;if(colorsChanged)bodies.instanceColor.needsUpdate=true;}
  stats.active=near.length;stats.maxActive=Math.max(stats.maxActive,near.length);stats.drawCalls=near.length?2:0;
  stats.triangles=near.length*(PARTS*geometry.index.count/3+10);stats.matrixUpdates=near.length*(PARTS+1);stats.shadowCasters=budget.shadows&&near.length>0;
 }
 function dispose(){
  if(disposed)return;disposed=true;world.scene.remove(bodies,shadows);bodies.dispose();shadows.dispose();geometry.dispose();material.dispose();shadowGeometry.dispose();shadowMaterial.dispose();
  stats.active=stats.drawCalls=stats.triangles=stats.matrixUpdates=0;
 }
 return {update,stats,dispose};
}
