import * as THREE from 'three';
import {environmentAssets} from './environment-assets.js';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
const hash=(x,z)=>{const n=Math.sin(x*127.1+z*311.7)*43758.5453;return n-Math.floor(n);};
export function mountainNoise(x,z){const ix=Math.floor(x),iz=Math.floor(z),u=smooth(0,1,x-ix),v=smooth(0,1,z-iz);return mix(mix(hash(ix,iz),hash(ix+1,iz),u),mix(hash(ix,iz+1),hash(ix+1,iz+1),u),v);}
const grass=new THREE.Color('#69745c'),stone=new THREE.Color('#918878'),shadeStone=new THREE.Color('#707679'),scree=new THREE.Color('#a09683');
/** CPU-baked ecology/geology; steep road cuttings cannot become grass carpets. */
export function chinaMountainColor(x,y,z,nx,ny,nz){
 const slope=1-clamp(ny),macro=mountainNoise(x/190,z/165),gully=mountainNoise((x+z*.28)/53,z/180),aspect=clamp(.5+nz*.5);
 const vegetation=(1-smooth(.12,.38,slope))*smooth(5,32,y)*(.75+.25*aspect)*(1-smooth(.75,.91,macro)*.7);
 const c=stone.clone().lerp(shadeStone,smooth(.46,.78,gully)*.42).lerp(scree,smooth(.5,.8,macro)*.3).lerp(grass,vegetation);
 c.multiplyScalar(.89+macro*.19);return[c.r,c.g,c.b,0,vegetation,.86+.14*gully];
}
/** One shared material; coarse pointers use four reads, desktop uses seven. */
export function chinaMountainMaterial(world){
 if(world.chinaMountainMaterial)return world.chinaMountainMaterial;
 const mobile=world.quality==='low'||(typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches);
 const material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.97,metalness:0,envMapIntensity:.06});
 material.name='China layered bedrock and slope vegetation';
 material.userData={textureSamples:mobile?4:7,perFrameUpdates:0,newTextures:0,warpStage:'vertex',profile:mobile?'coarse':'desktop'};
 material.onBeforeCompile=shader=>{
  shader.uniforms.uChinaWet=world.uniforms?.wet||{value:0};shader.uniforms.uChinaRock={value:environmentAssets.albedo};shader.uniforms.uChinaGrass={value:environmentAssets.grass?.diffuse||environmentAssets.albedo};
  // Terrain vertices are sparse compared with covered phone pixels. Evaluate
  // the twelve hash/sine terms here once per vertex, never per fragment.
  shader.vertexShader=`attribute vec3 mountainData;varying vec3 vMountainP,vMountainN,vMountainData,vMountainWarp;
float chinaHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float chinaNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(chinaHash(i),chinaHash(i+vec2(1.,0.)),f.x),mix(chinaHash(i+vec2(0.,1.)),chinaHash(i+vec2(1.)),f.x),f.y);}
`+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   vMountainP=(modelMatrix*vec4(position,1.)).xyz;vMountainN=normalize(mat3(modelMatrix)*normal);vMountainData=mountainData;
   vMountainWarp=vec3(chinaNoise(vMountainP.xz/51.),chinaNoise(vMountainP.zy/43.+vec2(8.3,1.7)),chinaNoise(vMountainP.xy/61.+vec2(2.5,9.2)))-.5;`);
  shader.fragmentShader=`uniform sampler2D uChinaRock,uChinaGrass;uniform float uChinaWet;varying vec3 vMountainP,vMountainN,vMountainData,vMountainWarp;
vec2 chinaRotate(vec2 p){return mat2(.819,-.574,.574,.819)*p;}
`+shader.fragmentShader;
  const mineralProjection=mobile?`
   // A world-fixed intermediate scale avoids texture swimming as the car moves.
   vec3 rockUv=(vMountainP+vMountainWarp*20.)/vec3(9.1,6.1,9.1);
   vec3 mineral=texture2D(uChinaRock,chinaRotate(rockUv.zy)+vec2(.21,.43)).rgb*blend.x+texture2D(uChinaRock,rockUv.xz+vec2(.73,.19)).rgb*blend.y+texture2D(uChinaRock,chinaRotate(rockUv.xy)+vec2(.37,.81)).rgb*blend.z;
  `:`
   vec3 rockUv=(vMountainP+vMountainWarp*13.)/vec3(6.5,4.4,6.5),largeUv=(vMountainP+vMountainWarp*23.)/vec3(19.3,13.7,19.3);
   vec3 finePhoto=texture2D(uChinaRock,chinaRotate(rockUv.zy)+vec2(.21,.43)).rgb*blend.x+texture2D(uChinaRock,rockUv.xz+vec2(.73,.19)).rgb*blend.y+texture2D(uChinaRock,chinaRotate(rockUv.xy)+vec2(.37,.81)).rgb*blend.z;
   vec3 broadPhoto=texture2D(uChinaRock,largeUv.zy+vec2(.57,.11)).rgb*blend.x+texture2D(uChinaRock,chinaRotate(largeUv.xz)+vec2(.17,.63)).rgb*blend.y+texture2D(uChinaRock,largeUv.xy+vec2(.83,.47)).rgb*blend.z;
   float fineWeight=.44*(1.-smoothstep(75.,480.,distance(cameraPosition,vMountainP)));
   vec3 mineral=mix(broadPhoto,finePhoto,fineWeight);
  `;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec3 mountainN=normalize(vMountainN),blend=pow(abs(mountainN),vec3(4.));blend/=blend.x+blend.y+blend.z;
   ${mineralProjection}
   float mineralLuma=dot(mineral,vec3(.299,.587,.114));
   vec3 grassPhoto=texture2D(uChinaGrass,vMountainP.xz/2.8).rgb;
   float detail=1.-smoothstep(160.,1150.,distance(cameraPosition,vMountainP));
   float grassCover=clamp(vMountainData.x,0.,1.),snowCover=clamp(vMountainData.y,0.,1.);
   // Wide mineral bedding follows tilted strata, not a fine glossy noise overlay.
   float bedding=sin(vMountainP.y*.40+vMountainP.x*.013+vMountainP.z*.008+mineralLuma*2.8);
   float scannedPlants=smoothstep(.008,.10,mineral.g-max(mineral.r,mineral.b));
   vec3 mineralPhoto=mix(mineral,vec3(mineralLuma)*vec3(1.04,1.01,.97),.36+scannedPlants*.5);
   vec3 mineralTint=clamp(vColor.rgb/vec3(.27,.245,.205),vec3(.62),vec3(1.4));
   vec3 rockPhoto=mineralPhoto*mineralTint*(.86+bedding*.10);
   vec3 grassSurface=mix(grassPhoto,vec3(dot(grassPhoto,vec3(.299,.587,.114))),.25)*vec3(.72,.86,.68);
   vec3 photoSurface=mix(rockPhoto,grassSurface,grassCover);
   diffuseColor.rgb=mix(diffuseColor.rgb,photoSurface,mix(.35,.90,detail)*(1.-snowCover));
   diffuseColor.rgb*=max(.78,vMountainData.z)*(1.-uChinaWet*.20*(1.-snowCover));`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.97,.80,uChinaWet*(1.-snowCover));');
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   float relief=(mineralLuma*.095+bedding*.012)*detail*(1.-grassCover*.75)*(1.-snowCover);
   vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition),r1=cross(dy,normal),r2=cross(normal,dx);
   float det=dot(dx,r1)*faceDirection;vec3 grad=sign(det)*(dFdx(relief)*r1+dFdy(relief)*r2);
   normal=normalize(max(abs(det),.000001)*normal-grad);`);
 };
 material.customProgramCacheKey=()=> 'china-mountain-geology-v4-'+(mobile?'coarse':'desktop');world.chinaMountainMaterial=material;return material;
}
