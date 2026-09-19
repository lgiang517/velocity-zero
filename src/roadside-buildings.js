import * as THREE from 'three';
import {environmentAssets} from './environment-assets.js';
const UP=new THREE.Vector3(0,1,0),rand=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};

// A front elevation always faces the road. The complete garden/platform footprint
// participates in route clearance and slope checks, not just the building centre.
export function planRoadsideBuildings(world,place){
 const sites=[];
 for(let i=0;i<450&&sites.length<40;i++){
  const coastal=i<150,t=coastal?.026+(i%50)*.0030:.491+(i%50)*.00345;
  const side=i%5===0?-1:1,s=t*world.track.length,variant=i%4;
  const w=variant===3?12:8.2+rand(i+4)*2.6,d=7.3+rand(i+51)*2.3;
  const plotW=w+4.2,plotD=d+4.5,radius=Math.hypot(plotW/2+.1,plotD/2+4.8);
  const lateral=side*(33+(Math.floor(i/50)%3)*10+rand(i+49)*5);
  const p=place.land(s,lateral,radius);if(!p)continue;
  if(sites.some(q=>Math.hypot(q.p.x-p.x,q.p.z-p.z)<q.radius+radius+2))continue;
  const heading=world.track.sample(s).heading-side*Math.PI/2;
  const heights=[];
  for(const x of [-plotW/2,0,plotW/2])for(const z of [-plotD/2,0,plotD/2]){
   const q=new THREE.Vector3(x,0,z).applyAxisAngle(UP,heading).add(p);heights.push(world.groundHeight(q.x,q.z));
  }
  if(heights.some(h=>!Number.isFinite(h)||h<0)||Math.max(...heights)-Math.min(...heights)>2.7)continue;
  const groundMin=Math.min(...heights),groundMax=Math.max(...heights);p.y=groundMax+.12;
  sites.push({id:i,s,t,p,heading,w,d,plotW,plotD,radius,side,variant,floors:variant===3?3:variant===1?1:2,groundMin,groundMax,foundationBottom:groundMin-.7});
 }
 return sites;
}

function facadeMaterial(type,color,roughness=.86){
 const asset=environmentAssets.roadside?.[type],mat=new THREE.MeshStandardMaterial({color,roughness,envMapIntensity:.25});
 if(asset){mat.map=asset.diffuse;mat.normalMap=asset.normal;mat.roughnessMap=asset.rough;mat.normalScale.set(.45,.45);}
 mat.onBeforeCompile=shader=>{
  // Correct UV density for differently scaled instances: metres, never whole-wall stretching.
  if(type==='plaster')shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`vec3 paintedWallBase=diffuseColor.rgb;
      #include <map_fragment>
      diffuseColor.rgb=paintedWallBase*clamp(vec3(.83)+(diffuseColor.rgb/max(paintedWallBase,vec3(.001))-vec3(.23))*.55,vec3(.64),vec3(1.));`);
  shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
    vec3 buildingScale=vec3(1.);
    #ifdef USE_INSTANCING
      buildingScale=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
    #endif
    vec2 buildingUV=uv*vec2(abs(normal.x)>.5?buildingScale.z:buildingScale.x,abs(normal.y)>.5?buildingScale.z:buildingScale.y)/${(asset?.metres||2).toFixed(1)};
    #ifdef USE_MAP
      vMapUv=buildingUV;
    #endif
    #ifdef USE_NORMALMAP
      vNormalMapUv=buildingUV;
    #endif
    #ifdef USE_ROUGHNESSMAP
      vRoughnessMapUv=buildingUV;
    #endif`);
 };
 mat.customProgramCacheKey=()=> 'roadside-metre-texture-v2-'+type+'-'+(asset?.metres||2);return mat;
}
function gableGeometry(){
 const g=new THREE.BufferGeometry();
 const p=[-.5,0,-.5,.5,0,-.5,0,1,-.5,-.5,0,.5,.5,0,.5,0,1,.5];
 g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex([0,2,1,3,4,5,0,3,5,0,5,2,1,2,5,1,5,4,0,1,4,0,4,3]);
 g.computeVertexNormals();const uv=[];for(let i=0;i<p.length;i+=3)uv.push(p[i]+.5,p[i+1]);g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));const flat=g.toNonIndexed();flat.computeVertexNormals();g.dispose();return flat;
}
export function buildRoadsideBuildings(world,place){
 const sites=planRoadsideBuildings(world,place);world.roadsideSites=sites;
 const materials={
  plaster:facadeMaterial('plaster','#ffffff'),wood:facadeMaterial('wood','#d0d9d1'),roof:facadeMaterial('roof','#737e83'),
  stone:facadeMaterial('plaster','#827d70'),paving:facadeMaterial('plaster','#aaa69b'),
  trim:new THREE.MeshStandardMaterial({color:'#dddcd3',roughness:.66}),dark:new THREE.MeshStandardMaterial({color:'#2e3537',roughness:.77}),
  glass:new THREE.MeshStandardMaterial({color:'#253e49',roughness:.18,metalness:.3,envMapIntensity:.9}),
  room:new THREE.MeshStandardMaterial({color:'#564538',roughness:1,emissive:'#efb670',emissiveIntensity:0}),
  foliage:new THREE.MeshStandardMaterial({color:'#55664a',roughness:1}),metal:new THREE.MeshStandardMaterial({color:'#626a69',roughness:.4,metalness:.7}),
 };
 const geometries={box:new THREE.BoxGeometry(1,1,1),gable:gableGeometry(),bush:new THREE.IcosahedronGeometry(1,1),cylinder:new THREE.CylinderGeometry(1,1,1,8)};
 const buckets=new Map(),dummy=new THREE.Object3D(),detailBatches=[];
 const stats={houses:sites.length,windows:0,instances:0,triangles:0,batches:0,visibleDetailBatches:0};
 function add(site,mat,x,y,z,w,h,d,{ry=0,rz=0,shape='box',detail=false,color}={}){
  const p=new THREE.Vector3(x,y,z).applyAxisAngle(UP,site.heading).add(site.p);
  const chunk=Math.floor(p.x/180)+':'+Math.floor(p.z/180),key=[mat,shape,detail,chunk].join('|');
  if(!buckets.has(key))buckets.set(key,{mat,shape,detail,items:[]});
  buckets.get(key).items.push({p,ry:site.heading+ry,rz,w,h,d,color});
 }
 const palette=['#ded7c6','#b2bbb5','#d1c3ad','#c8c9c1','#b4bfc0','#d7d1c4'];
 for(const site of sites){
  const {w,d,floors,variant,plotW,plotD}=site,base=.22,height=floors*3.1,bodyZ=-1.35;
  const wallType=variant===1?'wood':'plaster',wallColor=palette[site.id%palette.length];
  const footHeight=site.p.y-site.foundationBottom;
  add(site,'stone',0,-footHeight/2,0,plotW,footHeight,plotD);
  add(site,'paving',0,.06,0,plotW+.08,.12,plotD+.08);
  add(site,'stone',0,base/2,bodyZ,w+.16,base,d+.16);
  // Four actual wall elevations. Openings contain recessed glass and a dark interior layer.
  for(let side=0;side<4;side++){
   const angle=side*Math.PI/2,span=side%2?d:w;
   const cx=Math.sin(angle)*(w/2-.12),cz=bodyZ+Math.cos(angle)*(d/2-.12);
   const local=(mat,x,y,z,sx,sy,sz,opts={})=>add(site,mat,cx+Math.cos(angle)*x+Math.sin(angle)*z,base+y,cz-Math.sin(angle)*x+Math.cos(angle)*z,sx,sy,sz,{...opts,ry:angle+(opts.ry||0)});
   const bays=Math.max(2,Math.floor(span/2.6)),pitch=span/bays,ww=Math.min(1.35,pitch-.8);
   for(let floor=0;floor<floors;floor++){
    const y=floor*3.1;
    // Continuous storey cap plus isolated piers; no solid wall behind the glazing.
    local(wallType,0,y+2.72,0,span,.76,.24,{color:wallColor});
    let left=-span/2;
    for(let b=0;b<bays;b++){
     const x=-span/2+pitch*(b+.5),door=side===0&&((floor===0&&b===Math.floor(bays/2))||(floor===1&&b===0&&variant!==3)),bottom=door?0:.9,top=door?2.25:2.34;
     const a=x-ww/2,pier=a-left;if(pier>0)local(wallType,left+pier/2,y+1.17,0,pier,2.34,.24,{color:wallColor});left=x+ww/2;
     if(bottom)local(wallType,x,y+bottom/2,0,ww,bottom,.24,{color:wallColor});
     if(door)local(wallType,x,y+(top+2.34)/2,0,ww,2.34-top,.24,{color:wallColor});
     const hh=top-bottom;
     local('dark',x,y+bottom+hh/2,-.22,ww+.06,hh+.04,.06);
     local(door?'wood':'glass',x,y+bottom+hh/2,-.075,ww-.10,hh-.10,.035,{color:door?'#4c605c':undefined});
     if(!door){
      stats.windows++;
      for(const dx of [-ww/2,ww/2])local('trim',x+dx,y+bottom+hh/2,.03,.085,hh+.16,.23,{detail:true});
      for(const yy of [bottom,top])local('trim',x,y+yy,.07,ww+.18,.085,.29,{detail:true});
      local('trim',x,y+bottom+hh/2,.04,.05,hh,.12,{detail:true});
      local('trim',x,y+bottom+hh*.57,.04,ww,.045,.12,{detail:true});
      local('stone',x,y+bottom-.08,.19,ww+.29,.12,.46,{detail:true});
      if((site.id+b+floor)%3===0)local('room',x+ww*.22,y+bottom+hh/2,-.10,ww*.33,hh-.14,.015,{detail:true});
     }else{
      for(const dx of [-ww/2,ww/2])local('trim',x+dx,y+1.15,.05,.12,2.3,.27);
      local('trim',x,y+2.28,.05,ww+.24,.14,.27);
      local('glass',x,y+1.7,-.048,ww*.63,.63,.018,{detail:true});
      local('metal',x+ww*.31,y+1.02,.0,.04,.20,.05,{detail:true});
      local('dark',x,y+.03,.39,ww+1.0,.065,.64);
      local('roof',x,y+2.58,.86,ww+1.05,.12,1.85);
     }
    }
    if(left<span/2)local(wallType,(left+span/2)/2,y+1.17,0,span/2-left,2.34,.24,{color:wallColor});
    if(floor>0)local('trim',0,y-.06,.045,span+.08,.11,.31);
   }
   local('trim',0,height-.03,.08,span+.15,.19,.38);
  }
  // Closed roof volume, generous overhang, ridge, fascia and rainwater hardware.
  if(variant!==2){
   const rise=1.8+variant*.22,rw=w+.85,rd=d+.9,slope=Math.atan2(rise,rw/2),length=Math.hypot(rw/2,rise);
   add(site,wallType,0,base+height,bodyZ,w,rise,d,{shape:'gable',color:wallColor});
   for(const side of [-1,1]){
    add(site,'roof',side*rw/4,base+height+rise/2+.05,bodyZ,length+.13,.17,rd,{rz:-side*slope});
    add(site,'dark',side*rw/2,base+height-.035,bodyZ,.13,.20,rd);
    add(site,'metal',side*rw/2,base+height-.11,bodyZ,.12,.1,rd+.04,{detail:true});
   }
   add(site,'roof',0,base+height+rise+.12,bodyZ,.28,.17,rd);
  }else{
   add(site,'roof',0,base+height+.07,bodyZ,w+.55,.18,d+.55);
   for(const side of[-1,1])add(site,'trim',side*(w/2+.12),base+height+.22,bodyZ,.14,.35,d+.4);
   add(site,'dark',0,base+height+.18,bodyZ,w-.3,.14,d-.3);
   add(site,'metal',-w*.25,base+height+.54,bodyZ-1,1.45,.58,1.1,{detail:true});
  }
  add(site,'stone',-w*.28,base+height+.60,bodyZ-1.1,.75,1.6,.70);
  add(site,'dark',-w*.28,base+height+1.43,bodyZ-1.1,.91,.10,.86);
  for(const x of[-w/2-.16,w/2+.16])add(site,'metal',x,base+height/2,bodyZ+d/2-.2,.085,height,.085,{detail:true,shape:'cylinder'});
  // Small balcony on two-storey stucco homes; rail bars cast readable near shadows.
  if(floors>1&&variant!==3){
   const z=bodyZ+d/2+1,balconyX=-w/2+w/Math.max(2,Math.floor(w/2.6))*.5;
   add(site,'stone',balconyX,base+3.03,z,3.3,.20,1.9);
   for(let i=0;i<9;i++)add(site,'metal',balconyX-1.53+i*.382,base+3.61,z+.85,.055,1.0,.055,{detail:true});
   for(const yy of[3.2,4.12])add(site,'metal',balconyX,base+yy,z+.85,3.25,.06,.065,{detail:true});
   for(const dx of[-1.53,1.53])add(site,'metal',balconyX+dx,base+4.12,z, .06,.06,1.75,{detail:true});
  }
  // Footpaths and gardens sit on the terraced platform rather than floating on sloping grass.
  const gardenZ=plotD/2-1.35;
  const doorBays=Math.max(2,Math.floor(w/2.6)),doorX=-w/2+w/doorBays*(Math.floor(doorBays/2)+.5),frontZ=bodyZ+d/2;
  add(site,'paving',doorX,.18,(frontZ+gardenZ)/2,1.45,.1,gardenZ-frontZ+1.0);
  add(site,'paving',doorX/2,.18,gardenZ,Math.abs(doorX)+1.45,.1,.9);
  add(site,'paving',0,.18,(gardenZ+plotD/2)/2,1.45,.1,plotD/2-gardenZ+.08);
  for(const x of[-plotW/2+.65,plotW/2-.65]){
   add(site,'stone',x,.36,.7,.6,.6,plotD-2.3);
   for(let i=0;i<6;i++)add(site,'foliage',x,.79,-plotD/2+1.7+i*(plotD-3.7)/5,.5,.50,.70,{shape:'bush',detail:true,color:i%2?'#52664c':'#677052'});
  }
  for(const x of (variant===3?[]:[-plotW*.29,plotW*.30])){
   add(site,'stone',x,.36,gardenZ,2.6,.6,1.15);
   for(let i=0;i<3;i++)add(site,'foliage',x-.8+i*.8,.8,gardenZ,.66,.50,.55,{shape:'bush',color:site.id%2?'#5e6d4a':'#667953'});
  }
  // Human-scale arrival details, restrained enough to remain credible at driving speed.
  add(site,'metal',1.35,.64,plotD/2-.5,.075,1.2,.075,{detail:true});
  add(site,'wood',1.35,1.25,plotD/2-.5,.38,.28,.44,{detail:true,color:'#465a56'});
  add(site,'wood',-2,.64,gardenZ+.95,1.7,.11,.47,{detail:true});
  for(const x of[-2.65,-1.35])add(site,'dark',x,.35,gardenZ+.95,.07,.55,.40,{detail:true});
  // Solid steps descend to the sampled approach terrain; every tread has its own footing.
  const entry=localZ=>new THREE.Vector3(0,0,localZ).applyAxisAngle(UP,site.heading).add(site.p);
  const end=entry(plotD/2+4.35),endY=world.groundHeight(end.x,end.z)-site.p.y+.12;
  const stepCount=Math.max(2,Math.min(18,Math.ceil((.12-endY)/.18))),run=4.35/stepCount;
  for(let i=0;i<stepCount;i++){
   const z=plotD/2+(i+.5)*run,q=entry(z),top=.12+Math.min(0,endY-.12)*(i+1)/stepCount;
   const bottom=Math.min(world.groundHeight(q.x,q.z)-site.p.y-.55,top-.18);
   add(site,'stone',0,(top+bottom)/2,z,2.1,top-bottom,run+.018);
  }
 }
 for(const [key,bucket] of buckets){
  const {mat,shape,items,detail}=bucket,mesh=new THREE.InstancedMesh(geometries[shape],materials[mat],items.length);
  mesh.name='Roadside '+key;
  items.forEach((q,i)=>{dummy.position.copy(q.p);dummy.rotation.set(0,q.ry,q.rz,'YXZ');dummy.scale.set(q.w,q.h,q.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);if(q.color)mesh.setColorAt(i,new THREE.Color(q.color));});
  mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.castShadow=mat!=='glass'&&mat!=='room';mesh.receiveShadow=mat!=='room';
  world.scene.add(mesh);if(detail)detailBatches.push(mesh);
  stats.instances+=items.length;stats.batches++;stats.triangles+=(geometries[shape].index?.count||geometries[shape].attributes.position.count)/3*items.length;
 }
 world.roadsideStats=stats;
 const oldBefore=world.scene.onBeforeRender;
 world.scene.onBeforeRender=function(renderer,scene,camera,...rest){
  oldBefore.call(this,renderer,scene,camera,...rest);
  const range=world.quality==='low'?100:world.quality==='high'?240:170;stats.visibleDetailBatches=0;
  for(const mesh of detailBatches){mesh.visible=camera.position.distanceTo(mesh.boundingSphere.center)<range+mesh.boundingSphere.radius;if(mesh.visible)stats.visibleDetailBatches++;}
  materials.room.emissiveIntensity=(world.night||0)*.55;
 };
 return sites;
}
