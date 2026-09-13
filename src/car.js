import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {createCockpit} from './cockpit.js';
import {createCabinFloor} from './cabin-floor.js';
import {createCabinInterior} from './cabin-interior.js';
import {createWheelSet} from './wheels.js';
import {refineVehicleMaterial,setVehicleWetness} from './vehicle-materials.js';
// Version the public asset so an older cached GLB cannot survive a site update.
const CAR_MODEL='solstice-lux-gt.glb?v=b2a005095271';
let template,seatTemplate;
export async function loadCarModels(){
 if(template)return;
 const loader=new GLTFLoader(),base=import.meta.env.BASE_URL+'models/';
 const [car,seat]=await Promise.all([loader.loadAsync(base+CAR_MODEL),loader.loadAsync(base+'gt-seat.glb').catch(error=>{console.warn('Detailed seats unavailable; using cabin fallback',error);return null;})]);
 template=car.scene;template.userData.source=CAR_MODEL.includes('lux')?'Aholo Lux3D G1':'Blender procedural';seatTemplate=seat?.scene||null;
 if(seatTemplate)seatTemplate.traverse(o=>{if(o.isMesh){o.castShadow=false;for(const m of Array.isArray(o.material)?o.material:[o.material]){m.envMapIntensity=.32;m.color.multiplyScalar(.56);for(const value of Object.values(m))if(value?.isTexture)value.anisotropy=4;}}});
}
export function createCar(config,color='#e85824',simple=false){
 if(!template)throw new Error('Car model has not loaded');
 const isLux=template.userData.source==='Aholo Lux3D G1';
 const root=new THREE.Group(),body=template.clone(true);root.add(body);
 const mats=new Map(),ownedGeo=[],ownedTextures=[];
 body.traverse(o=>{if(o.isMesh){o.castShadow=!(Array.isArray(o.material)?o.material:[o.material]).every(m=>m.name==='Intake mesh'||m.name==='Window glass');o.receiveShadow=true;const clone=m=>{if(!mats.has(m)){const c=m.clone();c.envMapIntensity=.85;c.side=THREE.FrontSide;c.shadowSide=THREE.FrontSide;mats.set(m,c);}return mats.get(m);};o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);}});
 const find=name=>[...mats.values()].find(m=>m.name===name);
 const paint=find('Paint'),glass=find('Window glass')||find('Glass'),tailMat=find('Tail');paint.color.set(color);tailMat.emissive.set('#ff1004');
 // Refine cloned materials only; template resources and interior visibility remain shared safely.
 for(const m of mats.values()){refineVehicleMaterial(m,{simple});m.userData.exteriorDepthWrite=m.depthWrite;}
 const dark=new THREE.MeshStandardMaterial({color:'#10171b',roughness:.65}),brakeMat=new THREE.MeshStandardMaterial({color:'#68727b',metalness:.7,roughness:.4});
 const wheels=[],frontWheels=[],wheelVisual=createWheelSet({simple});
 // Reuse the exact exported axle transforms; the fixed caliper turns but never rolls.
 for(const w of [...body.children])if(w.name.startsWith('Wheel_')){
  const pivot=new THREE.Group();pivot.position.copy(w.position);pivot.quaternion.copy(w.quaternion);pivot.scale.copy(w.scale);body.add(pivot);
  const assembly=wheelVisual.create(Math.sign(w.position.x));
  const radius=THREE.MathUtils.clamp(Number(w.userData.tireRadius)||.375,.25,.5),width=THREE.MathUtils.clamp(Number(w.userData.tireWidth)||.276,.18,.38);
  assembly.root.scale.set(width/.276,radius/.375,radius/.375);
  assembly.root.position.x=isLux?0:-Math.sign(w.position.x)*(w.name.includes('_F')?.16:.12);
  assembly.rotating.userData.radius=radius;pivot.add(assembly.root);body.remove(w);wheels.push(assembly.rotating);if(w.name.includes('_F'))frontWheels.push(assembly.root);
 }
 for(const old of [...body.children])if(old.name==='Caliper')old.visible=false;
 body.scale.set(config.id==='light'?.96:1,config.id==='muscle'?1.03:1,config.id==='muscle'?1.06:config.id==='light'?.95:1);
 function box(parent,size,pos,mat=dark,r=.025){const g=new RoundedBoxGeometry(...size,2,r);ownedGeo.push(g);const m=new THREE.Mesh(g,mat);m.position.set(...pos);parent.add(m);return m;}
 const cockpitVisual=createCockpit({simple}),cockpit=cockpitVisual.root,steeringWheel=cockpitVisual.steeringWheel;root.add(cockpit);
 const cabinInterior=createCabinInterior({simple,seatTemplate});body.add(cabinInterior.root);
 const cabinFloor=simple?null:createCabinFloor();if(cabinFloor)cockpit.add(cabinFloor.root);
 const exhaust=[],flameMat=new THREE.MeshBasicMaterial({color:'#8cc9ff',transparent:true,opacity:.8,toneMapped:false});
 for(const side of [-1,1]){const g=new THREE.ConeGeometry(.055,.5,8);ownedGeo.push(g);const flame=new THREE.Mesh(g,flameMat);flame.rotation.x=-Math.PI/2;const anchor=body.getObjectByName(side>0?'Exhaust_L':'Exhaust_R');if(anchor)flame.position.copy(anchor.position).add(new THREE.Vector3(0,0,-.25));else flame.position.set(side*.64,.355,-2.57);body.add(flame);flame.visible=false;exhaust.push(flame);}
 const hoodPaint=refineVehicleMaterial(paint.clone(),{simple}),hoodTrim=new Map(),sourceHood=body.getObjectByName('Driver_hood');
 let hood;
 if(sourceHood){
  root.updateMatrixWorld(true);hood=sourceHood.clone(true);
  const transform=new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(sourceHood.matrixWorld);
  transform.decompose(hood.position,hood.quaternion,hood.scale);
  hood.traverse(object=>{if(object.isMesh){
   const clone=m=>{if(m.name==='Paint')return hoodPaint;if(!hoodTrim.has(m)){const copy=refineVehicleMaterial(m.clone(),{simple});copy.colorWrite=true;hoodTrim.set(m,copy);}return hoodTrim.get(m);};
   object.material=Array.isArray(object.material)?object.material.map(clone):clone(object.material);object.castShadow=false;object.receiveShadow=true;
  }});
 }else{
  const hoodPositions=[],hoodIndices=[],hoodSections=[[.87,.79,.85],[1.3,.82,.88],[1.8,.76,.84],[2.14,.68,.78]];
  for(const [z,y,width]of hoodSections)for(const x of[-width,0,width])hoodPositions.push(x,y-(x===0?.012:0),z);
  for(let row=0;row<3;row++)for(let col=0;col<2;col++){const a=row*3+col;hoodIndices.push(a,a+3,a+1,a+1,a+3,a+4);}
  const hoodGeo=new THREE.BufferGeometry();hoodGeo.setAttribute('position',new THREE.Float32BufferAttribute(hoodPositions,3));hoodGeo.setIndex(hoodIndices);hoodGeo.computeVertexNormals();ownedGeo.push(hoodGeo);hood=new THREE.Mesh(hoodGeo,hoodPaint);hood.receiveShadow=true;
 }
 cockpit.add(hood);
 if(isLux&&!simple){
  // Close the sightline below the separate bonnet without raising the driver's eye.
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.81,.825,.85,.81,.825,.85,-.81,.865,1.34,.81,.865,1.34,-.81,.70,.85,.81,.70,.85,-.81,.70,1.34,.81,.70,1.34],3));
  geometry.setIndex([0,2,1,1,2,3,4,5,6,5,7,6,0,1,4,1,5,4,2,6,3,3,6,7,0,4,2,2,4,6,1,3,5,3,7,5]);geometry.computeVertexNormals();ownedGeo.push(geometry);
  let leather=dark;cockpit.traverse(o=>{if(o.isMesh&&o.material?.name==='Fine grain warm leather')leather=o.material;});
  const cowl=new THREE.Mesh(geometry,leather);cowl.name='Closed bonnet cowl';cockpit.add(cowl);
 }

 const stopLightMaterial=new THREE.MeshStandardMaterial({color:'#c9190d',emissive:'#ff0802',emissiveIntensity:3.2,toneMapped:false});
 const rearStopLights=[];if(!isLux)for(const side of [-1,1]){const x=side*.64,z=-2.255+.13*(.64/.86)**3-.053;const lamp=box(body,[.32,.05,.013],[x,.68,z],stopLightMaterial,.009);lamp.rotation.y=-side*.22;lamp.visible=false;rearStopLights.push(lamp);}
 const highAnchor=body.getObjectByName('Brake_high'),stopLight=isLux&&!highAnchor?null:box(body,[.39,.025,.012],highAnchor?highAnchor.position.toArray():[0,1.175,-1.055],stopLightMaterial,.005);if(stopLight)stopLight.visible=false;
 const brakeGlow=simple?null:new THREE.PointLight('#ff1908',0,3.2,2);if(brakeGlow){brakeGlow.position.set(0,.43,-2.48);root.add(brakeGlow);}
 const reflectionMaterials=[...mats.values()].filter(m=>['Paint','Window glass','Glass','Alloy'].includes(m.name));reflectionMaterials.push(hoodPaint,...[...hoodTrim.values()].filter(m=>['Window glass','Glass','Alloy'].includes(m.name)));
 return {setEnvironment(texture){for(const m of reflectionMaterials)if(m.envMap!==texture){const toggle=!!m.envMap!==!!texture;m.envMap=texture;if(toggle)m.needsUpdate=true;}},setPaint(color){paint.color.set(color);hoodPaint.color.copy(paint.color);},setWetness(wet){setVehicleWetness(paint,wet);setVehicleWetness(hoodPaint,wet);},setInterior(inside){cockpit.visible=inside;cabinInterior.setInterior(inside);wheelVisual.setInterior(inside);for(const m of [...mats.values(),stopLightMaterial,flameMat]){m.colorWrite=!inside;m.depthWrite=inside?false:(m.userData.exteriorDepthWrite??true);}},root,body,paint,hood,hoodPaint,glass,brakeGlow,wheels,frontWheels,tailMat,brakeMat,cockpit,cabinInterior,steeringWheel,exhaust,
 update(p,dt){for(const w of wheels)w.rotation.x+=p.u*dt/w.userData.radius;for(const w of frontWheels)w.rotation.y=p.steer;body.rotation.z=p.roll;body.rotation.x=p.pitch;body.position.y=-Math.abs(p.roll)*.06;const braking=p.brake>.05;tailMat.emissiveIntensity=braking?4.2:.75;if(stopLight)stopLight.visible=braking;for(const lamp of rearStopLights)lamp.visible=braking;if(brakeGlow)brakeGlow.intensity=braking?4.5:0;for(const f of exhaust){f.visible=p.boost;f.scale.y=.85+Math.sin(p.s*2)*.15;}cockpitVisual.update(p,dt);cabinInterior.update?.(p,dt);},
 dispose(){wheelVisual.dispose();for(const m of mats.values())m.dispose();for(const g of ownedGeo)g.dispose();for(const t of ownedTextures)t.dispose();hoodPaint.dispose();for(const m of hoodTrim.values())m.dispose();stopLightMaterial.dispose();dark.dispose();brakeMat.dispose();flameMat.dispose();cockpitVisual.dispose();cabinFloor?.dispose();cabinInterior.dispose();}
 };
}



