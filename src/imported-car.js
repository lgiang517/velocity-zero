import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {refineVehicleMaterial,setVehicleWetness} from './vehicle-materials.js';

const templates=new Map(),pending=new Map();
export const IMPORTED_MODELS={db12:'aston-db12.glb?v=6698b21981e9',gtc4lusso:'ferrari-gtc4lusso.glb?v=fb574b02e7ce',f812:'ferrari-812-competizione.glb?v=717fe4b47a88'};
export async function loadImportedCar(id){
 if(!IMPORTED_MODELS[id]||templates.has(id))return;
 if(!pending.has(id))pending.set(id,new GLTFLoader().loadAsync(import.meta.env.BASE_URL+'models/'+IMPORTED_MODELS[id]).then(gltf=>{templates.set(id,gltf.scene);}).finally(()=>pending.delete(id)));
 await pending.get(id);
}

const unit=value=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
/** The shipped GLBs share several lamp materials with reverse lamps, wheels or
 * rear bulb housings. Classify the authored NODE plus material, never a broad
 * material-name substring across the complete car. */
export function importedFrontLampProfile(id,nodeName,material){
 const name=material.name||'',role=material.userData?.vehicleLightRole;
 if(role==='front'||role==='drl')return{key:role,day:Number.isFinite(material.userData.idleIntensity)?material.userData.idleIntensity:material.emissiveIntensity||0,night:role==='drl'?1.8:3.4,mask:null};
 if(id==='db12'){
  if(/^headlight_[lr]$/.test(nodeName)&&name==='DB12 astonmartin_db12_2023_lighta_diffuse.001')return{key:'db12-projector',day:.30,night:3.6,mask:null};
  if(/^extralight_[12]$/.test(nodeName)&&name==='DB12 emissive_round_lighter')return{key:'db12-drl',day:.55,night:2.2,mask:null};
 }
 if(id==='gtc4lusso'&&/^chassis_pivot_(details|chrome)$/.test(nodeName)&&name==='Ferrari details')return{key:'gtc4-front-housing',day:.20,night:3.2,mask:'gtc4'};
 if(id==='f812'&&nodeName.startsWith('Light_Geo_lodA_')&&name.endsWith('_2021LightA_Material'))return{key:'812-front-housing',day:.24,night:3.4,mask:'f812'};
 return null;
}
function prepareFrontLamp(material,profile){
 material.userData.vehicleLightRole='front';material.userData.vehicleFrontProfile=profile.key;
 material.emissive.set('#f0f5ff');material.emissiveIntensity=profile.day;
 // Reuse the authored black/white lamp atlas as the emission mask. This keeps
 // black surrounds dark without a downloaded texture or an extra texture read.
 material.emissiveMap=material.emissiveMap||material.map;
 if(!profile.mask)material.toneMapped=false;
 if(!profile.mask)return;
 const mask=profile.mask==='gtc4'
  ? 'step(.57,abs(vImportedLampP.x))*step(abs(vImportedLampP.x),.89)*step(.58,vImportedLampP.y)*step(vImportedLampP.y,.89)*step(1.59,vImportedLampP.z)*step(vImportedLampP.z,2.29)'
  : 'step(.45,abs(vImportedLampP.x))*step(abs(vImportedLampP.x),1.01)*step(.48,vImportedLampP.y)*step(vImportedLampP.y,1.02)*step(1.28,vImportedLampP.z)';
 material.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec3 vImportedLampP;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvImportedLampP=position;');
  shader.fragmentShader='varying vec3 vImportedLampP;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance *= '+mask+';');
 };
 material.customProgramCacheKey=()=> 'authored-front-light-'+profile.mask+'-v1';
}


function prepareGtc4RearLamp(material){
 // These original game-light surfaces are overlapping additive sprites. Their
 // black atlas background must contribute zero light, never occlude another
 // ring: the brake sprite lies in front of the position sprite even at rest.
 material.transparent=true;material.blending=THREE.AdditiveBlending;
 material.depthWrite=false;material.forceSinglePass=true;material.fog=false;
 material.color.set(0x000000);
 material.onBeforeCompile=shader=>{
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',
   'outgoingLight=totalEmissiveRadiance;\n#include <opaque_fragment>');
 };
 material.customProgramCacheKey=()=> 'gtc4-authored-additive-rear-v1';
}

/** Authored cars retain their own shell, cabin and wheel geometry. */
export function createImportedCar(config,color,simple=false,source=templates.get(config.id)){
 if(!source)throw new Error(config.name+' model has not loaded');
 const root=new THREE.Group(),body=source.clone(true),materials=new Map();root.add(body);
 body.userData.source=config.name+' · authored model';
 const frontLights=[];
 body.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;
  const clone=m=>{const front=importedFrontLampProfile(config.id,o.name,m),key=front?m.uuid+':'+front.key:m;if(!materials.has(key)){const copy=m.clone();
   if(['Paint','Tail'].includes(copy.name))refineVehicleMaterial(copy,{simple});
   if(copy.name==='Paint')copy.envMapIntensity=copy.userData.vehicleFinish?.envIntensity??copy.envMapIntensity;
   else copy.envMapIntensity=.85;
   if(['combined','brake','position'].includes(copy.userData.vehicleLightRole)){copy.envMapIntensity=0;copy.roughness=1;copy.metalness=0;if('specularIntensity' in copy)copy.specularIntensity=0;copy.toneMapped=false;}
   if(copy.userData.vehicleLampLens||copy.userData.vehicleLightRole==='lens')copy.depthWrite=false;
   if(config.id==='gtc4lusso'&&['combined','brake'].includes(copy.userData.vehicleLightRole))prepareGtc4RearLamp(copy);
   if(front){prepareFrontLamp(copy,front);frontLights.push({material:copy,profile:front});}
   materials.set(key,copy);
  }return materials.get(key);};
  o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);
  if((Array.isArray(o.material)?o.material:[o.material]).every(m=>m.name==='Window glass'))o.castShadow=false;
 });
 const paints=[...materials.values()].filter(m=>m.name==='Paint'),tails=[...materials.values()].filter(m=>m.name==='Tail');
 const rearLights=[...materials.values()].filter(m=>['combined','brake','position'].includes(m.userData.vehicleLightRole));
 for(const m of paints)m.color.set(color);
 for(const m of rearLights){m.emissive.set('#ff1002');m.emissiveIntensity=Number(m.userData.idleIntensity)||0;}
 const lightState={night:0,tunnel:0,wet:0,amount:0,brake:0,frontCount:frontLights.length,rearCount:rearLights.length,frontIntensity:0,tailIntensity:0,brakeIntensity:0};
 function applyLighting(){
  const raw=Math.max(lightState.night,lightState.tunnel,lightState.wet*.70),amount=THREE.MathUtils.smoothstep(raw,.08,.65);
  lightState.amount=amount;lightState.frontIntensity=0;lightState.tailIntensity=0;lightState.brakeIntensity=0;
  for(const lamp of frontLights){const intensity=THREE.MathUtils.lerp(lamp.profile.day,lamp.profile.night,amount);lamp.material.emissiveIntensity=intensity;lightState.frontIntensity=Math.max(lightState.frontIntensity,intensity);}
  for(const material of rearLights){
   const role=material.userData.vehicleLightRole,idle=Number(material.userData.idleIntensity)||0,stop=Number(material.userData.brakeIntensity)||0;
   // The dedicated high stop remains dark except while braking. Position and
   // combined lamps gain a night running-light level below the stop intensity.
   const running=role==='brake'?idle:THREE.MathUtils.lerp(idle,Math.max(idle,config.id==='gtc4lusso'?.82:.78),amount);
   const braking=lightState.brake>.05&&role!=='position',intensity=braking?Math.max(stop,running):running;
   material.emissiveIntensity=intensity;
   if(role!=='brake')lightState.tailIntensity=Math.max(lightState.tailIntensity,running);
   if(braking)lightState.brakeIntensity=Math.max(lightState.brakeIntensity,intensity);
  }
 }
 applyLighting();
 const wheels=[],frontWheels=[];
 for(const corner of ['lf','rf','lr','rr']){
  const wheel=body.getObjectByName('Wheel_'+corner);if(!wheel)throw new Error(config.name+': missing Wheel_'+corner);
  body.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(wheel);
  const radius=Number(wheel.userData.radius)||(bounds.max.y-bounds.min.y)/2;
  const pivot=new THREE.Group();pivot.name='Steer_'+corner;
  wheel.parent.add(pivot);pivot.position.copy(wheel.position);pivot.quaternion.copy(wheel.quaternion);pivot.scale.copy(wheel.scale);
  pivot.attach(wheel);wheel.userData.radius=radius>.1?radius:.36;
  wheel.userData.rollBase=wheel.quaternion.clone();wheel.userData.rollAngle=0;wheels.push(wheel);
  if(corner.endsWith('f')){frontWheels.push(pivot);const caliper=body.getObjectByName('Caliper_'+corner);if(caliper)pivot.attach(caliper);}
 }
 const metadata={...config,...source.userData};
 // Blender may export scene extras on a named child rather than the glTF scene.
 body.traverse(o=>{for(const key of ['driverEye','bonnetEye','steeringAxis','nativeCabin'])if(o.userData[key]!==undefined)metadata[key]=o.userData[key];});
 const nativeCabin=metadata.nativeCabin===true;
 const driverEye=nativeCabin?(metadata.driverEye||[.35,1.04,-.45]):(metadata.bonnetEye||[0,1.15,1.15]);
 const steeringWheel=body.getObjectByName('SteeringWheel'),steeringBase=steeringWheel?.quaternion.clone();
 const steeringAxis=new THREE.Vector3(...(metadata.steeringAxis||[0,0,1])).normalize();
 const rollingAxis=new THREE.Vector3(1,0,0),rotation=new THREE.Quaternion();
 const glass=[...materials.values()].find(m=>m.name==='Window glass');
 const cockpit=new THREE.Group();cockpit.name=nativeCabin?'Native driving cabin':'Bonnet camera';
 const cabinInterior={stats:()=>({native:nativeCabin,model:config.id,source:nativeCabin?'Original model interior':'Exterior model; bonnet view'}),setInterior(){}};
 return {root,body,wheels,frontWheels,lightState,paint:paints[0],glass,tailMat:rearLights[0]||tails[0],steeringWheel,cockpit,cabinInterior,
  driverEye,driverCameraFrame:body,cameraKind:nativeCabin?'driver':'bonnet',brakeGlow:null,exhaust:[],
  setLighting({night=0,tunnel=0,wet=0}={}){lightState.night=unit(night);lightState.tunnel=unit(tunnel);lightState.wet=unit(wet);applyLighting();},
  setPaint(value){for(const m of paints)m.color.set(value);},
  setWetness(wet){for(const m of paints)setVehicleWetness(m,wet);},
  setEnvironment(texture,{fallbackTexture=null,intensityScale=1}={}){
   for(const m of materials.values()){
    // The shared HDR is borrowed only by paint, including the original cabin hood.
    // Other materials retain their existing scene-environment and glazing behavior.
    const paint=m.name==='Paint',map=texture||(paint?fallbackTexture:null);
    if(m.envMap!==map){const changed=!!m.envMap!==!!map;m.envMap=map;if(changed)m.needsUpdate=true;}
    const base=m.userData.vehicleFinish?.envIntensity;
    if(paint&&Number.isFinite(base))m.envMapIntensity=base*intensityScale;
   }
  },
  setInterior(inside){cockpit.visible=inside&&nativeCabin;},
  update(p,dt){
   for(const w of wheels){w.userData.rollAngle=(w.userData.rollAngle+p.u*dt/w.userData.radius)%(Math.PI*2);w.quaternion.copy(w.userData.rollBase).multiply(rotation.setFromAxisAngle(rollingAxis,w.userData.rollAngle));}
   for(const pivot of frontWheels)pivot.rotation.y=p.steer;
   if(steeringWheel)steeringWheel.quaternion.copy(steeringBase).multiply(rotation.setFromAxisAngle(steeringAxis,-p.steer*8));
   body.rotation.z=p.roll;body.rotation.x=p.pitch;body.position.y=-Math.abs(p.roll)*.06;
   lightState.brake=unit(p.brake);applyLighting();
  },
  dispose(){for(const material of materials.values())material.dispose();}
 };
}
