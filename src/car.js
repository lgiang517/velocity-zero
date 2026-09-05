import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
let template;
export async function loadCarModels(){if(!template)template=(await new GLTFLoader().loadAsync(import.meta.env.BASE_URL+'models/solstice-gt.glb')).scene;}
export function createCar(config,color='#e85824',simple=false){
 if(!template)throw new Error('Car model has not loaded');
 const root=new THREE.Group(),body=template.clone(true);root.add(body);
 const mats=new Map(),ownedGeo=[],ownedTextures=[];
 body.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;const clone=m=>{if(!mats.has(m)){const c=m.clone();c.envMapIntensity=.85;mats.set(m,c);}return mats.get(m);};o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);}});
 const find=name=>[...mats.values()].find(m=>m.name===name);
 const paint=find('Paint'),glass=find('Glass'),tailMat=find('Tail');paint.color.set(color);
 const dark=new THREE.MeshStandardMaterial({color:'#10171b',roughness:.65}),brakeMat=new THREE.MeshStandardMaterial({color:'#68727b',metalness:.7,roughness:.4});
 const wheels=[],frontWheels=[];
 // Preserve the exported wheel transform and turn around its own axle.
 for(const w of [...body.children])if(w.name.startsWith('Wheel_')){
  const pivot=new THREE.Group();pivot.position.copy(w.position);pivot.quaternion.copy(w.quaternion);pivot.scale.copy(w.scale);body.add(pivot);
  w.position.set(0,0,0);w.quaternion.identity();w.scale.set(1,1,1);pivot.add(w);wheels.push(w);if(w.name.includes('_F'))frontWheels.push(pivot);
 }
 body.scale.set(config.id==='light'?.96:1,config.id==='muscle'?1.03:1,config.id==='muscle'?1.06:config.id==='light'?.95:1);
 function box(parent,size,pos,mat=dark,r=.025){const g=new RoundedBoxGeometry(...size,2,r);ownedGeo.push(g);const m=new THREE.Mesh(g,mat);m.position.set(...pos);parent.add(m);return m;}
 const cockpit=new THREE.Group();root.add(cockpit);cockpit.visible=false;
 box(cockpit,[1.76,.50,.78],[0,.56,.55]);
 box(cockpit,[1.79,.20,2.5],[0,.37,-.12]);
 box(cockpit,[1.79,.08,.20],[0,1.65,.31]);
 box(cockpit,[.56,.08,.36],[.34,.96,.48]);
 box(cockpit,[.35,.40,.75],[0,.54,.02]);
 // Hood and connected windshield frame remain visible in driver view.
 box(cockpit,[1.63,.065,1.1],[0,.78,1.52],paint,.03);
 for(const side of [-1,1]){
  const pillar=box(cockpit,[.067,1.25,.095],[side*.79,1.28,.48]);pillar.rotation.x=-.68;
  box(cockpit,[.14,.56,1.8],[side*.84,.62,-.10]);
  box(cockpit,[.19,.085,.12],[side*1.0,.97,.58],glass);
 }
 const wheelGeo=new THREE.TorusGeometry(.177,.021,8,32);ownedGeo.push(wheelGeo);
 const steeringWheel=new THREE.Group();steeringWheel.position.set(.35,.91,.20);cockpit.add(steeringWheel);
 const rim=new THREE.Mesh(wheelGeo,dark);steeringWheel.add(rim);
 box(steeringWheel,[.3,.038,.03],[0,0,0]);box(steeringWheel,[.045,.14,.035],[0,-.06,0]);box(steeringWheel,[.10,.075,.05],[0,0,0]);
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas);ownedTextures.push(texture);
 const gaugeMat=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});const gauge=box(cockpit,[.44,.12,.01],[.35,.99,.49],gaugeMat,.005);gauge.rotation.y=Math.PI;
 const exhaust=[],flameMat=new THREE.MeshBasicMaterial({color:'#8cc9ff',transparent:true,opacity:.8,toneMapped:false});
 for(const side of [-1,1]){const g=new THREE.ConeGeometry(.055,.5,8);ownedGeo.push(g);const flame=new THREE.Mesh(g,flameMat);flame.rotation.x=-Math.PI/2;flame.position.set(side*.64,.355,-2.57);body.add(flame);flame.visible=false;exhaust.push(flame);}
 let lastSpeed=-1;
 return {root,body,paint,glass,wheels,frontWheels,tailMat,brakeMat,cockpit,steeringWheel,exhaust,
 update(p,dt){for(const w of wheels)w.rotation.x+=p.u*dt/.375;for(const w of frontWheels)w.rotation.y=p.steer;body.rotation.z=p.roll;body.rotation.x=p.pitch;body.position.y=-Math.abs(p.roll)*.06;tailMat.emissiveIntensity=p.brake>.08?4:1.3;for(const f of exhaust){f.visible=p.boost;f.scale.y=.85+Math.sin(p.s*2)*.15;}steeringWheel.rotation.z=-p.steer*5;
 const speed=Math.round(Math.abs(p.u)*3.6);if(cockpit.visible&&speed!==lastSpeed){lastSpeed=speed;ctx.fillStyle='#061017';ctx.fillRect(0,0,512,128);ctx.fillStyle='#f3efe4';ctx.font='bold 74px monospace';ctx.textAlign='center';ctx.fillText(String(speed).padStart(3,'0'),250,85);ctx.font='18px sans-serif';ctx.fillText('KM/H',400,83);ctx.fillStyle='#ff7d3d';ctx.fillRect(24,107,Math.max(2,460*p.rpm/8000),5);texture.needsUpdate=true;}},
 dispose(){for(const m of mats.values())m.dispose();for(const g of ownedGeo)g.dispose();for(const t of ownedTextures)t.dispose();dark.dispose();brakeMat.dispose();flameMat.dispose();gaugeMat.dispose();}
 };
}



