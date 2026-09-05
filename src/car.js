import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

const tireMat=new THREE.MeshStandardMaterial({color:'#151b1d',roughness:.94});
const darkMat=new THREE.MeshStandardMaterial({color:'#152025',metalness:.55,roughness:.32});
const chrome=new THREE.MeshStandardMaterial({color:'#bdc3c3',metalness:.9,roughness:.2});
const rimMat=new THREE.MeshStandardMaterial({color:'#8b9698',metalness:.92,roughness:.24});
const geometryCache=new Map();
function geo(w,h,d,r=0){const key=[w,h,d,r].join();if(!geometryCache.has(key))geometryCache.set(key,r?new RoundedBoxGeometry(w,h,d,2,r):new THREE.BoxGeometry(w,h,d));return geometryCache.get(key);}
function box(parent,w,h,d,mat,x,y,z,r=0){const m=new THREE.Mesh(geo(w,h,d,r),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function loft(sections,mat){
  const pos=[],idx=[];
  for(const [z,w,bottom,top]of sections){const outline=[[-w*.86,bottom],[-w,bottom+.12],[-w,top-.1],[-w*.8,top],[w*.8,top],[w,top-.1],[w,bottom+.12],[w*.86,bottom]];for(const [x,y]of outline)pos.push(x,y,z);}
  for(let i=0;i<sections.length-1;i++)for(let j=0;j<8;j++){const a=i*8+j,b=i*8+(j+1)%8,c=(i+1)*8+j,d=(i+1)*8+(j+1)%8;idx.push(a,b,c,b,d,c);}
  for(let j=1;j<7;j++){idx.push(0,j+1,j);const a=(sections.length-1)*8;idx.push(a,a+j,a+j+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));for(let i=0;i<idx.length;i+=3){const t=idx[i+1];idx[i+1]=idx[i+2];idx[i+2]=t;}g.setIndex(idx);g.computeVertexNormals();const mesh=new THREE.Mesh(g,mat);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}
export function createCar(config,color='#e85824',simple=false){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);
  const paint=new THREE.MeshPhysicalMaterial({color,metalness:.73,roughness:.26,clearcoat:1,clearcoatRoughness:.12,envMapIntensity:1.6});
  const glass=new THREE.MeshPhysicalMaterial({color:'#233b42',metalness:.55,roughness:.12,clearcoat:1,envMapIntensity:2.2});
  const long=config.id==='muscle'?1.1:config.id==='light'?.92:1;
  body.add(loft([[-2.25,.88,.39,.82],[-2.0,.99,.31,.97],[-1.35,1.02,.31,1.01],[.1,.96,.31,.99],[1.25,1,.33,.88],[2.07,.93,.37,.74],[2.26,.83,.43,.65]],paint));
  body.add(loft([[-1.38,.87,.86,.95],[-.67,.73,.89,1.48],[.3,.72,.9,1.48],[1.04,.83,.84,.94]],glass));
  box(body,1.45,.07,1.04,paint,0,1.48,-.2,.055);
  // Pillars follow the raked windscreen and rear glass.
  for(const side of[-1,1]){
    let pillar=box(body,.055,.69,.06,paint,side*.76,1.20,.67,.015);pillar.rotation.x=-.91;pillar.rotation.z=side*.12;
    pillar=box(body,.052,.66,.06,paint,side*.77,1.19,-1.01,.015);pillar.rotation.x=.87;pillar.rotation.z=-side*.15;
    box(body,.04,.56,.065,darkMat,side*.745,1.19,-.37);
    box(body,.035,.055,1.65,paint,side*.875,.95,-.22,.01);
    box(body,.13,.035,.045,chrome,side*.984,.88,-.35,.012);
    box(body,.23,.1,.29,paint,side*1.06,1.03,.66,.04);
    box(body,.075,.14,2.6,darkMat,side*.95,.31,0,.025);
  }
  box(body,1.82,.18,.13,darkMat,0,.51,-2.21,.025);
  box(body,1.24,.16,.11,darkMat,0,.7,-2.265,.025);
  box(body,1.55,.045,.06,chrome,0,.92,-2.05,.02);
  box(body,1.88,.09,.4,darkMat,0,.30,-1.98,.02);
  for(let x=-.6;x<=.61;x+=.3)box(body,.035,.13,.33,darkMat,x,.31,-2.02);
  const tailMat=new THREE.MeshStandardMaterial({color:'#fa391c',emissive:'#ff1c07',emissiveIntensity:2.4,toneMapped:false});
  for(const side of[-1,1]){box(body,.69,.055,.035,tailMat,side*.5,.81,-2.265,.015);box(body,.35,.04,.035,tailMat,side*.72,.73,-2.26,.01);}
  const headMat=new THREE.MeshStandardMaterial({color:'#eefaff',emissive:'#d0efff',emissiveIntensity:3,toneMapped:false});
  for(const side of[-1,1]){box(body,.52,.06,.09,headMat,side*.61,.7,2.17,.02);box(body,.56,.025,.11,headMat,side*.61,.62,2.18,.01);box(body,.44,.16,.08,darkMat,side*.62,.47,2.2,.02);}
  box(body,1.18,.17,.08,darkMat,0,.48,2.24,.025);
  box(body,1.86,.035,.35,darkMat,0,.35,2.08,.015);
  const plateCanvas=document.createElement('canvas');plateCanvas.width=256;plateCanvas.height=64;const ctx=plateCanvas.getContext('2d');ctx.fillStyle='#e7dfc6';ctx.fillRect(0,0,256,64);ctx.fillStyle='#273432';ctx.font='bold 35px sans-serif';ctx.textAlign='center';ctx.fillText('V E L O C I T Y',128,46);
  box(body,.48,.115,.016,new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture(plateCanvas),roughness:.6}),0,.58,-2.289);
  if(config.id==='gt'||config.id==='light'){
    for(const side of[-1,1])box(body,.055,.17,.08,darkMat,side*.62,1.05,-1.9);
    box(body,1.94,.055,.36,darkMat,0,1.14,-1.94,.025);
  }
  const wheels=[],brakes=[],frontWheels=[];
  const brakeMat=new THREE.MeshStandardMaterial({color:'#596165',metalness:.8,roughness:.45,emissive:'#f74210',emissiveIntensity:0});
  for(const side of[-1,1])for(const z of[-1.38,1.39]){
    const pivot=new THREE.Group();pivot.position.set(side*.97,.43,z);body.add(pivot);
    const wheel=new THREE.Group();pivot.add(wheel);
    const tire=new THREE.Mesh(new THREE.CylinderGeometry(.40,.40,.29,simple?12:32,1),tireMat);tire.rotation.z=Math.PI/2;wheel.add(tire);
    const rim=new THREE.Mesh(new THREE.CylinderGeometry(.30,.30,.30,simple?10:24,1),darkMat);rim.rotation.z=Math.PI/2;wheel.add(rim);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.292,.019,6,24),rimMat);ring.rotation.y=Math.PI/2;ring.position.x=side*.16;wheel.add(ring);
    for(let i=0;i<(simple?5:7);i++){const angle=i/(simple?5:7)*Math.PI*2;const spoke=box(wheel,.025,.045,.52,rimMat,side*.167,0,0,.012);spoke.rotation.x=angle;}
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.085,.085,.33,12),chrome);hub.rotation.z=Math.PI/2;wheel.add(hub);
    if(!simple){const brake=new THREE.Mesh(new THREE.CylinderGeometry(.245,.245,.045,24),brakeMat);brake.rotation.z=Math.PI/2;brake.position.x=side*.11;pivot.add(brake);brakes.push(brake);box(pivot,.075,.19,.1,new THREE.MeshStandardMaterial({color:'#eea329',metalness:.4,roughness:.4}),side*.13,.03,-.21,.02);}
    wheels.push(wheel);if(z>0)frontWheels.push(pivot);
  }
  const exhaust=[];
  const flameMat=new THREE.MeshBasicMaterial({color:'#93c9ff',transparent:true,opacity:.8,toneMapped:false});
  for(const side of[-1,1]){
    const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.083,.09,.2,12,1,true),chrome);pipe.rotation.x=Math.PI/2;pipe.position.set(side*.73,.43,-2.23);body.add(pipe);
    const flame=new THREE.Mesh(new THREE.ConeGeometry(.073,.65,8),flameMat);flame.rotation.x=-Math.PI/2;flame.position.set(side*.73,.43,-2.59);flame.visible=false;body.add(flame);exhaust.push(flame);
  }
  // Ground contact patch is soft and independent of dynamic shadows.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=64;shadowCanvas.height=64;const sc=shadowCanvas.getContext('2d');const grad=sc.createRadialGradient(32,32,4,32,32,32);grad.addColorStop(0,'rgba(0,0,0,.65)');grad.addColorStop(1,'rgba(0,0,0,0)');sc.fillStyle=grad;sc.fillRect(0,0,64,64);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(3.6,6),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.025;root.add(shadow);
  body.scale.z=long;
  // Dashboard is visible only from the cockpit camera.
  const cockpit=new THREE.Group();box(cockpit,1.55,.22,.44,darkMat,0,1.01,.52,.07);const steeringWheel=new THREE.Mesh(new THREE.TorusGeometry(.19,.024,8,24),darkMat);steeringWheel.position.set(.36,1.2,.34);steeringWheel.rotation.x=-.3;cockpit.add(steeringWheel);cockpit.visible=false;root.add(cockpit);
  return {root,body,paint,glass,wheels,frontWheels,tailMat,brakeMat,exhaust,cockpit,steeringWheel,
    dispose(){const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(o.isMesh){if(![...geometryCache.values()].includes(o.geometry))geometries.add(o.geometry);for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(![tireMat,darkMat,chrome,rimMat].includes(m))materials.add(m);}});for(const g of geometries)g.dispose();for(const m of materials){if(m.map)textures.add(m.map);m.dispose();}for(const t of textures)t.dispose();},
    update(p,dt){for(const w of wheels)w.rotation.x+=p.u*dt/.4;for(const w of frontWheels)w.rotation.y=p.steer;body.rotation.z=p.roll;body.rotation.x=p.pitch;body.position.y=-Math.abs(p.roll)*.08;tailMat.emissiveIntensity=p.brake>.08?6:2.4;brakeMat.emissiveIntensity=p.brakeHeat*.8;for(const flame of exhaust){flame.visible=p.boost;flame.scale.y=.8+Math.sin(p.s*2)*.2;}steeringWheel.rotation.z=-p.steer*5;}
  };
}
