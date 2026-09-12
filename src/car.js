import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {createCockpit} from './cockpit.js';
import {createCabinFloor} from './cabin-floor.js';
import {createWheelSet} from './wheels.js';
let template;
export async function loadCarModels(){if(!template)template=(await new GLTFLoader().loadAsync(import.meta.env.BASE_URL+'models/solstice-gt.glb')).scene;}
export function createCar(config,color='#e85824',simple=false){
 if(!template)throw new Error('Car model has not loaded');
 const root=new THREE.Group(),body=template.clone(true);root.add(body);
 const mats=new Map(),ownedGeo=[],ownedTextures=[];
 body.traverse(o=>{if(o.isMesh){o.castShadow=!(Array.isArray(o.material)?o.material:[o.material]).every(m=>m.name==='Intake mesh');o.receiveShadow=true;const clone=m=>{if(!mats.has(m)){const c=m.clone();c.envMapIntensity=.85;c.side=THREE.FrontSide;c.shadowSide=THREE.FrontSide;mats.set(m,c);}return mats.get(m);};o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);}});
 const find=name=>[...mats.values()].find(m=>m.name===name);
 const paint=find('Paint'),glass=find('Glass'),tailMat=find('Tail');paint.color.set(color);tailMat.emissive.set('#ff1004');
 // Preserve exported coating detail without transmission render targets per vehicle.
 paint.clearcoat=1;paint.clearcoatRoughness=.16;glass.metalness=.05;glass.roughness=.12;
 if(glass.isMeshPhysicalMaterial){glass.clearcoat=.65;glass.clearcoatRoughness=.10;glass.ior=1.5;}
 const dark=new THREE.MeshStandardMaterial({color:'#10171b',roughness:.65}),brakeMat=new THREE.MeshStandardMaterial({color:'#68727b',metalness:.7,roughness:.4});
 const wheels=[],frontWheels=[],wheelVisual=createWheelSet({simple});
 // Reuse the exact exported axle transforms; the fixed caliper turns but never rolls.
 for(const w of [...body.children])if(w.name.startsWith('Wheel_')){
  const pivot=new THREE.Group();pivot.position.copy(w.position);pivot.quaternion.copy(w.quaternion);pivot.scale.copy(w.scale);body.add(pivot);
  const assembly=wheelVisual.create(Math.sign(w.position.x));pivot.add(assembly.root);body.remove(w);wheels.push(assembly.rotating);if(w.name.includes('_F'))frontWheels.push(pivot);
 }
 for(const old of [...body.children])if(old.name==='Caliper')old.visible=false;
 body.scale.set(config.id==='light'?.96:1,config.id==='muscle'?1.03:1,config.id==='muscle'?1.06:config.id==='light'?.95:1);
 function box(parent,size,pos,mat=dark,r=.025){const g=new RoundedBoxGeometry(...size,2,r);ownedGeo.push(g);const m=new THREE.Mesh(g,mat);m.position.set(...pos);parent.add(m);return m;}
 const cockpitVisual=createCockpit({simple}),cockpit=cockpitVisual.root,steeringWheel=cockpitVisual.steeringWheel;root.add(cockpit);
 const cabinFloor=simple?null:createCabinFloor();if(cabinFloor)cockpit.add(cabinFloor.root);
 const exhaust=[],flameMat=new THREE.MeshBasicMaterial({color:'#8cc9ff',transparent:true,opacity:.8,toneMapped:false});
 for(const side of [-1,1]){const g=new THREE.ConeGeometry(.055,.5,8);ownedGeo.push(g);const flame=new THREE.Mesh(g,flameMat);flame.rotation.x=-Math.PI/2;flame.position.set(side*.64,.355,-2.57);body.add(flame);flame.visible=false;exhaust.push(flame);}
 const hoodPaint=paint.clone(),hoodPositions=[],hoodIndices=[];
 const hoodSections=[[.87,.79,.85],[1.3,.82,.88],[1.8,.76,.84],[2.14,.68,.78]];
 for(const [z,y,width]of hoodSections)for(const x of[-width,0,width])hoodPositions.push(x,y-(x===0?.012:0),z);
 for(let row=0;row<3;row++)for(let col=0;col<2;col++){const a=row*3+col;hoodIndices.push(a,a+3,a+1,a+1,a+3,a+4);}
 const hoodGeo=new THREE.BufferGeometry();hoodGeo.setAttribute('position',new THREE.Float32BufferAttribute(hoodPositions,3));hoodGeo.setIndex(hoodIndices);hoodGeo.computeVertexNormals();ownedGeo.push(hoodGeo);const hood=new THREE.Mesh(hoodGeo,hoodPaint);hood.receiveShadow=true;cockpit.add(hood);
 const stopLightMaterial=new THREE.MeshStandardMaterial({color:'#c9190d',emissive:'#ff0802',emissiveIntensity:3.2,toneMapped:false});
 const rearStopLights=[];for(const side of [-1,1]){const x=side*.64,z=-2.255+.13*(.64/.86)**3-.053;const lamp=box(body,[.32,.05,.013],[x,.68,z],stopLightMaterial,.009);lamp.rotation.y=-side*.22;lamp.visible=false;rearStopLights.push(lamp);}
 const stopLight=box(body,[.39,.025,.012],[0,1.175,-1.055],stopLightMaterial,.005);stopLight.visible=false;
 const brakeGlow=simple?null:new THREE.PointLight('#ff1908',0,3.2,2);if(brakeGlow){brakeGlow.position.set(0,.43,-2.48);root.add(brakeGlow);}
 return {setInterior(inside){cockpit.visible=inside;wheelVisual.setInterior(inside);for(const m of [...mats.values(),stopLightMaterial,flameMat]){m.colorWrite=!inside;m.depthWrite=!inside;}},root,body,paint,glass,brakeGlow,wheels,frontWheels,tailMat,brakeMat,cockpit,steeringWheel,exhaust,
 update(p,dt){for(const w of wheels)w.rotation.x+=p.u*dt/.375;for(const w of frontWheels)w.rotation.y=p.steer;body.rotation.z=p.roll;body.rotation.x=p.pitch;body.position.y=-Math.abs(p.roll)*.06;const braking=p.brake>.05;tailMat.emissiveIntensity=braking?4.2:.75;stopLight.visible=braking;for(const lamp of rearStopLights)lamp.visible=braking;if(brakeGlow)brakeGlow.intensity=braking?4.5:0;for(const f of exhaust){f.visible=p.boost;f.scale.y=.85+Math.sin(p.s*2)*.15;}cockpitVisual.update(p,dt);},
 dispose(){wheelVisual.dispose();for(const m of mats.values())m.dispose();for(const g of ownedGeo)g.dispose();for(const t of ownedTextures)t.dispose();hoodPaint.dispose();stopLightMaterial.dispose();dark.dispose();brakeMat.dispose();flameMat.dispose();cockpitVisual.dispose();cabinFloor?.dispose();}
 };
}



