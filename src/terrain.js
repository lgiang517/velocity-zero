import {environmentAssets} from './environment-assets.js';
import * as THREE from 'three';

// World-space materials keep ground detail consistent across long road sections.
const noiseGLSL=`
float thash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float tnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(thash(i),thash(i+vec2(1,0)),f.x),mix(thash(i+vec2(0,1)),thash(i+vec2(1,1)),f.x),f.y);}
float tfbm(vec2 p){return tnoise(p)*.53+tnoise(p*2.07)*.27+tnoise(p*4.13)*.13+tnoise(p*8.3)*.07;}`;
const wave=(x,z)=>Math.sin(x*.013+Math.sin(z*.006)*2)*Math.cos(z*.019)+Math.sin(x*.038+z*.023)*.28;

export function terrainMaterial({distant=false}={}){
 const mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.97,envMapIntensity:.15});
 mat.onBeforeCompile=shader=>{
  shader.uniforms.uRockColor={value:environmentAssets.albedo};shader.uniforms.uRockNormal={value:environmentAssets.normal};shader.uniforms.uRockRough={value:environmentAssets.roughness};
  shader.vertexShader='varying vec3 vTerrainP;varying vec3 vTerrainN;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTerrainP=(modelMatrix*vec4(position,1.)).xyz;vTerrainN=normalize(mat3(modelMatrix)*normal);');
  shader.fragmentShader='uniform sampler2D uRockColor,uRockNormal,uRockRough;varying vec3 vTerrainP;varying vec3 vTerrainN;\n'+noiseGLSL+'\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec3 p=vTerrainP;float slope=1.-abs(normalize(vTerrainN).y);
   float broad=tfbm(p.xz*.031),mottle=tfbm(p.xz*.21),grain=tnoise(p.xz*2.8);
   float strata=tnoise(vec2(p.x*.07+p.z*.04,p.y*.32+mottle*2.));
   vec3 grass=mix(vec3(.038,.062,.028),vec3(.14,.17,.071),broad);
   grass*=.76+mottle*.42+grain*.14;
   vec3 blend=pow(abs(normalize(vTerrainN)),vec3(4.));blend/=blend.x+blend.y+blend.z;
   vec3 stone=texture2D(uRockColor,p.zy*.031).rgb*blend.x+texture2D(uRockColor,p.xz*.031).rgb*blend.y+texture2D(uRockColor,p.xy*.031).rgb*blend.z;
   grass=mix(grass,texture2D(uRockColor,p.xz*.055).rgb*vec3(.63,.82,.45),.23);
   stone*=.82+broad*.27;
   float rock=smoothstep(.16,.53,slope+broad*.12);
   vec3 ground=mix(grass,stone,rock);
   float sand=(1.-smoothstep(-1.,14.,p.y))*.75;
   ground=mix(ground,vec3(.25,.235,.17)*(mottle*.3+.8),sand);
   diffuseColor.rgb=ground;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(texture2D(uRockRough,vTerrainP.xz*.031).r*.36+.60,.65,1.);');
  if(!distant)shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   float relief=tnoise(vTerrainP.xz*1.3)*.025+tnoise(vTerrainP.xz*5.2)*.009;
   vec3 sigmaX=dFdx(vViewPosition),sigmaY=dFdy(vViewPosition);
   vec3 r1=cross(sigmaY,normal),r2=cross(normal,sigmaX);
   float det=dot(sigmaX,r1);
   normal=normalize(abs(det)*normal-sign(det)*(dFdx(relief)*r1+dFdy(relief)*r2));
   vec3 mapped=texture2D(uRockNormal,vTerrainP.xz*.031).xyz*2.-1.;
   normal=normalize(normal+mat3(viewMatrix)*vec3(mapped.x,0.,mapped.y)*mix(.14,.42,rock));`);
 };
 mat.customProgramCacheKey=()=>`coast-terrain-${distant?'far':'near'}-v2`;
 return mat;
}

export function buildCoastalTerrain(world){
 const track=world.track,sampled=track.samples.filter((_,i)=>i%3===0);
 // Match the existing driving surface; outside the verge, erosion breaks up the hills.
 world.groundHeight=(x,z)=>{
  let nearest=sampled[0],min=Infinity,nearIndex=0;
  for(let i=0;i<sampled.length;i++){
   const q=sampled[i],d=(x-q.p.x)**2+(z-q.p.z)**2;
   if(d<min){min=d;nearest=q;nearIndex=i;}
  }
  const distance=Math.sqrt(min),side=(x-nearest.p.x)*nearest.right.x+(z-nearest.p.z)*nearest.right.z,t=nearIndex/sampled.length;
  if(t>.90&&t<.993&&distance<145)return -12;
  const mountain=t>.18&&t<.48;
  const rise=side>0?Math.min(105,Math.max(0,distance-20)*(mountain?.31:.11)):-Math.max(0,distance-20)*.55;
  const erosion=wave(x,z)*Math.min(16,Math.max(0,distance-22)*.1);
  const nearHeight=nearest.p.y-1.9+rise+erosion;
  // Blend road-derived landforms away from the verge; nearest-segment switches
  // must not create vertical walls across the island.
  let heightSum=0,weightSum=0;
  if(distance>22)for(let i=0;i<sampled.length;i+=6){
   const q=sampled[i],dx=x-q.p.x,dz=z-q.p.z,dist=Math.hypot(dx,dz),lateral=dx*q.right.x+dz*q.right.z;
   const weight=1/(dx*dx+dz*dz+6400)**2;
   const uphill=lateral>0?Math.min(96,Math.max(0,dist-20)*.16):-Math.max(0,dist-20)*.28;
   heightSum+=(q.p.y-1.9+uphill)*weight;weightSum+=weight;
  }
  const blend=Math.min(1,Math.max(0,(distance-22)/85)),smooth=blend*blend*(3-2*blend);
  return Math.max(-14,nearHeight*(1-smooth)+(weightSum?heightSum/weightSum+erosion:nearHeight)*smooth);
 };
 const nx=210,nz=275,minX=-500,minZ=-1200,w=2300,h=3400,pos=[],idx=[];
 for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){
  const wx=minX+x/nx*w,wz=minZ+z/nz*h;pos.push(wx,world.groundHeight(wx,wz),wz);
 }
 for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
  const a=z*(nx+1)+x,b=a+nx+1;idx.push(a,b,a+1,a+1,b,b+1);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();
 const land=new THREE.Mesh(g,terrainMaterial());land.receiveShadow=true;land.castShadow=true;world.scene.add(land);
 for(const side of[-1,1]){
  const vg=track.ribbon(side<0?-20:10.3,side<0?-10.3:20,-.2);
  for(let i=0;i<vg.attributes.position.count;i++){const t=Math.floor(i/2)/track.count;if(t>.90&&t<.993)vg.attributes.position.setY(i,-14);}
  vg.computeVertexNormals();const verge=new THREE.Mesh(vg,terrainMaterial());verge.receiveShadow=true;world.scene.add(verge);
 }
 // Broad, asymmetrical ridges replace repeated cone-shaped mountains.
 const mountainMat=terrainMaterial({distant:true});
 for(let layer=0;layer<3;layer++){
  const rows=54,cols=210,positions=[],indices=[];
  for(let z=0;z<=rows;z++)for(let x=0;x<=cols;x++){
   const wx=-2600+x/cols*5900,wz=1450+layer*560+z/rows*1150;
   const along=x/cols;
   const crest=220+layer*80+85*Math.sin(along*16+layer)+48*Math.sin(along*31+layer*3);
   const profile=Math.max(0,Math.sin(Math.PI*z/rows))**.9;
   const ridge=profile*(crest+Math.sin(wx*.0032+Math.cos(wz*.003))*56+Math.sin(wx*.0071+wz*.002)*24);
   positions.push(wx,-29+Math.max(0,ridge),wz);
  }
  for(let z=0;z<rows;z++)for(let x=0;x<cols;x++){const a=z*(cols+1)+x,b=a+cols+1;indices.push(a,b,a+1,a+1,b,b+1);}
  const ridgeGeo=new THREE.BufferGeometry();ridgeGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));ridgeGeo.setIndex(indices);ridgeGeo.computeVertexNormals();
  const ridgeMesh=new THREE.Mesh(ridgeGeo,mountainMat);ridgeMesh.castShadow=true;ridgeMesh.receiveShadow=true;world.scene.add(ridgeMesh);
 }
}
