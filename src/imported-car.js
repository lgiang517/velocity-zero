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

/** Authored cars retain their own shell, cabin and wheel geometry. */
export function createImportedCar(config,color,simple=false,source=templates.get(config.id)){
 if(!source)throw new Error(config.name+' model has not loaded');
 const root=new THREE.Group(),body=source.clone(true),materials=new Map();root.add(body);
 body.userData.source=config.name+' · authored model';
 body.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;
  const clone=m=>{if(!materials.has(m)){const copy=m.clone();
   if(['Paint','Tail'].includes(copy.name))refineVehicleMaterial(copy,{simple});
   copy.envMapIntensity=.85;
   if(['combined','brake','position'].includes(copy.userData.vehicleLightRole)){copy.envMapIntensity=0;copy.roughness=1;copy.metalness=0;if('specularIntensity' in copy)copy.specularIntensity=0;copy.toneMapped=false;}
   if(copy.userData.vehicleLampLens||copy.userData.vehicleLightRole==='lens')copy.depthWrite=false;
   materials.set(m,copy);
  }return materials.get(m);};
  o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);
  if((Array.isArray(o.material)?o.material:[o.material]).every(m=>m.name==='Window glass'))o.castShadow=false;
 });
 const paints=[...materials.values()].filter(m=>m.name==='Paint'),tails=[...materials.values()].filter(m=>m.name==='Tail');
 const rearLights=[...materials.values()].filter(m=>['combined','brake','position'].includes(m.userData.vehicleLightRole));
 for(const m of paints)m.color.set(color);
 for(const m of rearLights){if(config.id==='gtc4lusso')m.color.set('#b51b24');m.emissive.set('#ff1002');m.emissiveIntensity=Number(m.userData.idleIntensity)||0;}
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
 return {root,body,wheels,frontWheels,paint:paints[0],glass,tailMat:rearLights[0]||tails[0],steeringWheel,cockpit,cabinInterior,
  driverEye,driverCameraFrame:body,cameraKind:nativeCabin?'driver':'bonnet',brakeGlow:null,exhaust:[],
  setPaint(value){for(const m of paints)m.color.set(value);},
  setWetness(wet){for(const m of paints)setVehicleWetness(m,wet);},
  setEnvironment(texture){for(const m of materials.values())if(m.envMap!==texture){const changed=!!m.envMap!==!!texture;m.envMap=texture;if(changed)m.needsUpdate=true;}},
  setInterior(inside){cockpit.visible=inside&&nativeCabin;},
  update(p,dt){
   for(const w of wheels){w.userData.rollAngle=(w.userData.rollAngle+p.u*dt/w.userData.radius)%(Math.PI*2);w.quaternion.copy(w.userData.rollBase).multiply(rotation.setFromAxisAngle(rollingAxis,w.userData.rollAngle));}
   for(const pivot of frontWheels)pivot.rotation.y=p.steer;
   if(steeringWheel)steeringWheel.quaternion.copy(steeringBase).multiply(rotation.setFromAxisAngle(steeringAxis,-p.steer*8));
   body.rotation.z=p.roll;body.rotation.x=p.pitch;body.position.y=-Math.abs(p.roll)*.06;
   for(const m of rearLights){const idle=Number(m.userData.idleIntensity)||0;const active=Number(m.userData.brakeIntensity)||0;m.emissiveIntensity=p.brake>.05&&m.userData.vehicleLightRole!=='position'?active:idle;}
  },
  dispose(){for(const material of materials.values())material.dispose();}
 };
}
