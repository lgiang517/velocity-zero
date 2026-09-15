import * as THREE from 'three';
import {environmentAssets} from './environment-assets.js';
const TAU=Math.PI*2,UP=new THREE.Vector3(0,1,0);
const random=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
const v=(x,y,z)=>new THREE.Vector3(x,y,z);

function builder(){
 const positions=[],normals=[],uvs=[],colors=[],indices=[];
 return {
  card(root,direction,width,cant,shade=1,rect=[0,0,1,1]){
   const along=direction.clone().normalize(),across=new THREE.Vector3().crossVectors(along,UP).normalize();
   if(across.lengthSq()<.01)across.set(1,0,0);
   across.applyAxisAngle(along,cant);
   const base=positions.length/3;
   for(const [u,t]of [[0,-1],[0,1],[1,-1],[1,1]]){
    const p=root.clone().addScaledVector(direction,u).addScaledVector(across,t*width*.5);
    // Canopy normals simulate light scattering through a spray of many leaves.
    const n=v(p.x*.65,.20,p.z*.65).normalize();
    positions.push(p.x,p.y,p.z);normals.push(n.x,n.y,n.z);
    uvs.push(rect[0]+u*(rect[2]-rect[0]),rect[1]+(t+1)*.5*(rect[3]-rect[1]));
    colors.push(shade,shade,shade);
   }
   indices.push(base,base+2,base+1,base+1,base+2,base+3);
  },
  stem(start,end,radius,tip=radius*.25,sides=5){
   const direction=end.clone().sub(start).normalize(),q=new THREE.Quaternion().setFromUnitVectors(UP,direction),base=positions.length/3;
   for(let j=0;j<2;j++)for(let i=0;i<=sides;i++){
    const a=i/sides*TAU,n=v(Math.cos(a),0,Math.sin(a)).applyQuaternion(q),p=(j?end:start).clone().addScaledVector(n,j?tip:radius);
    positions.push(p.x,p.y,p.z);normals.push(n.x,n.y,n.z);uvs.push(i/sides,j*start.distanceTo(end)*8);colors.push(1,1,1);
   }
   for(let i=0;i<sides;i++){const a=base+i,b=a+sides+1;indices.push(a,b,a+1,a+1,b,b+1);}
  },
  finish(){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeBoundingSphere();return g;}
 };
}

// A reproducible, uneven branch skeleton is shared by both detail levels.
// No closed green hull remains, so sky and branch shadows show through the crown.
function coniferBranches(){
 const branches=[];
 for(let tier=0;tier<13;tier++){
  const y=.18+tier*.061;
  for(let j=0;j<5;j++){
   const seed=tier*19+j*7+42,angle=j*TAU/5+tier*2.399+random(seed)*.4;
   const reach=(.255*Math.pow(1-y,.80)+.012)*(.78+random(seed+5)*.38);
   const root=v(Math.sin(y*4)*.008,y+(random(seed+3)-.5)*.035,0);
   const end=root.clone().add(v(Math.cos(angle)*reach,-.012-random(seed+8)*.018,Math.sin(angle)*reach));
   branches.push({root,end,angle,reach,seed,y});
  }
 }
 return branches;
}
export function coniferGeometry(detailed=false){
 const b=builder();
 for(const {root,end,angle,reach,seed,y} of coniferBranches()){
  const direction=end.clone().sub(root);
  // Each bough has several overlapping, differently tilted twig sprays.
  const sprays=detailed?13:8;
  for(let j=0;j<sprays;j++){
   const t=.20+random(seed+j*47+90)*.78;
   const side=j%2?1:-1,spread=angle+side*(.25+random(seed+j)*.72);
   const p=root.clone().addScaledVector(direction,t);
   const length=(.055+reach*.45)*(1-t*.22);
   const d=v(Math.cos(spread)*length,-.01+random(seed+j+7)*.03,Math.sin(spread)*length);
   b.card(p,d,length*.50,(random(seed+j+2)-.5)*1.9,.65+y*.28+random(seed+j+11)*.16);
  }
 }
 // A narrow leader avoids a blunt or cut-off tip.
 for(let j=0;j<6;j++){const a=j*2.399; b.card(v(0,.94+j*.008,0),v(Math.cos(a)*.033,.062,Math.sin(a)*.033),.05,a,.95);}
 return b.finish();
}
export function coniferWoodGeometry(){const b=builder();b.stem(v(0,-.035,0),v(.006,1.02,.003),.016,.0018,12);for(let i=0;i<6;i++){const a=i*2.399;b.stem(v(0,.024,0),v(Math.cos(a)*.041,-.026,Math.sin(a)*.041),.007,.001,4);}for(const {root,end,y}of coniferBranches())b.stem(root,end,.0045*(1-y)+.001,.0006,4);return b.finish();}

const crowns=[[-.17,.64,.04,.17],[.15,.68,.01,.20],[.03,.87,-.12,.18],[-.10,.83,.16,.17],[.18,.84,.13,.15],[-.20,.77,-.12,.16],[.02,.65,-.18,.18],[.015,.98,.03,.13]];
export function broadleafCanopyGeometry(detailed=false){
 const b=builder(),count=detailed?140:90;
 crowns.forEach(([x,y,z,r],cluster)=>{
  for(let i=0;i<count;i++){
   const seed=cluster*131+i*17,theta=i*2.399+cluster,ny=1-2*random(seed+21),radial=Math.sqrt(1-ny*ny);
   const direction=v(Math.cos(theta)*radial,ny*.8,Math.sin(theta)*radial).normalize();
   const p=v(x,y,z).addScaledVector(direction,r*(.30+random(seed)*.65));
   const tilt=v(Math.cos(theta+.7),-.1+random(seed+3)*.8,Math.sin(theta+.7)).normalize();
   const length=.085+random(seed+5)*.062;
   b.card(p,tilt.multiplyScalar(length),length*(.47+random(seed+8)*.08),random(seed+1)*TAU,.72+random(seed+6)*.26);
  }
 });
 return b.finish();
}
export function broadleafWoodGeometry(){const b=builder();b.stem(v(0,-.04,0),v(-.018,.65,.015),.022,.005,12);for(let i=0;i<5;i++){const a=i*2.399;b.stem(v(0,.035,0),v(Math.cos(a)*.059,-.03,Math.sin(a)*.059),.011,.002,4);}crowns.forEach(([x,y,z],i)=>{const root=v(0,.36+random(i+51)*.20,0),end=v(x,y,z);b.stem(root,end,.007,.0014,5);});return b.finish();}

function fallbackLeaf(){const width=64,data=new Uint8Array(width*width*4);for(let y=0;y<width;y++)for(let x=0;x<width;x++){const k=(y*width+x)*4,u=x/63,w=Math.sin(u*Math.PI)*.37;data.set([81,113,52,Math.abs(y/63-.5)<w?255:0],k);}const map=new THREE.DataTexture(data,width,width);map.colorSpace=THREE.SRGBColorSpace;map.generateMipmaps=true;map.minFilter=THREE.LinearMipmapLinearFilter;map.needsUpdate=true;return map;}
let fallback;
export function canopyMaterial(world,species){
 const assets=environmentAssets.vegetation?.[species];
 const mat=new THREE.MeshLambertMaterial({map:assets?.diffuse||(fallback??=fallbackLeaf()),color:'#ffffff',normalMap:assets?.normal||null,normalScale:new THREE.Vector2(.18,.18),vertexColors:true,side:THREE.DoubleSide,alphaTest:.19,alphaToCoverage:true});
 const wind=shader=>{
  shader.uniforms.treeTime=world.uniforms.time;
  shader.vertexShader='uniform float treeTime;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   float phase=instanceMatrix[3].x*.17+instanceMatrix[3].z*.13;
   float bend=pow(max(position.y-.2,0.),2.);
   transformed.x+=sin(treeTime*1.1+phase+position.y*4.)*.0025*bend;
   transformed.z+=cos(treeTime*.8+phase+position.x*6.)*.0018*bend;`);
 };
 mat.onBeforeCompile=shader=>{wind(shader);shader.uniforms.treeNight=world.uniforms.night||{value:0};shader.uniforms.treeSun=world.uniforms.sunDir||{value:new THREE.Vector3(0,1,0)};shader.fragmentShader='uniform float treeNight;uniform vec3 treeSun;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
 reflectedLight.indirectDiffuse+=diffuseColor.rgb*(.13+.07*pow(max(dot(normalize(vViewPosition),-(mat3(viewMatrix)*treeSun)),0.),2.))*(1.-treeNight*.96);`);shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nnormal=normalize(vNormal);normal=faceforward(normal,-normalize(vViewPosition),normal);');};
 mat.customProgramCacheKey=()=> 'photographic-canopy-'+species+'-v1';
 const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:mat.map,alphaTest:mat.alphaTest,side:THREE.DoubleSide});depth.onBeforeCompile=wind;depth.customProgramCacheKey=()=> 'tree-wind-depth-v1';
 mat.userData.foliageDepth=depth;return mat;
}
export function barkMaterial(world){
 const assets=environmentAssets.vegetation?.bark;
 const mat=new THREE.MeshStandardMaterial({color:assets?'#d7d0c4':'#625441',map:assets?.diffuse||null,normalMap:assets?.normal||null,normalScale:new THREE.Vector2(.7,.7),roughness:.97,envMapIntensity:.16});
 mat.onBeforeCompile=shader=>{shader.uniforms.barkNight=world?.uniforms.night||{value:0};shader.fragmentShader='uniform float barkNight;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>','#include <lights_fragment_end>\nreflectedLight.indirectDiffuse+=diffuseColor.rgb*.22*(1.-barkNight*.96);');shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
  #ifdef USE_MAP
   vMapUv.y*=length(instanceMatrix[1].xyz)/8.;
  #endif
  #ifdef USE_NORMALMAP
   vNormalMapUv.y*=length(instanceMatrix[1].xyz)/8.;
  #endif`);};
 mat.customProgramCacheKey=()=> 'tree-bark-metre-uv-v1';return mat;
}
