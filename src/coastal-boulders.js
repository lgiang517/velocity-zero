import * as THREE from 'three';
import {mergeVertices,toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';
import {environmentAssets} from './environment-assets.js';

/** One shared weathered mesh; the existing spatial instance batches are retained. */
export function coastalBoulderGeometry(){
 const source=new THREE.IcosahedronGeometry(1,3),positions=source.attributes.position;
 for(let i=0;i<positions.count;i++){
  const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
  const fracture=1+.105*Math.sin(x*4.3+z*2.7)+.065*Math.sin(z*5.1-y*3.4);
  let px=x*fracture,py=y*(.86+.075*Math.sin(x*3.7+z*2.1)),pz=z*(1+.085*Math.sin(x*3.2-y*2.6));
  // Oblique bedding and broken faces; a low buried base keeps the stone grounded.
  py=Math.min(py,.64+.16*px-.13*pz);px=Math.min(px,.78+.14*py+.13*pz);pz=Math.max(pz,-.79+.12*px-.11*py);
  py=Math.max(py,-.72);positions.setXYZ(i,px,py,pz);
 }
 source.deleteAttribute('normal');source.deleteAttribute('uv');
 const welded=mergeVertices(source,1e-4);source.dispose();welded.computeVertexNormals();
 const geometry=toCreasedNormals(welded,.62);welded.dispose();
 const p=geometry.attributes.position,colors=[];
 for(let i=0;i<p.count;i++){const y=p.getY(i),shade=.72+.28*THREE.MathUtils.smoothstep(y,-.6,.35);colors.push(shade,shade,shade);}
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeBoundingBox();geometry.computeBoundingSphere();
 return geometry;
}

export function coastalBoulderMaterial(){
 const mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.94,metalness:0,envMapIntensity:.12,vertexColors:true});
 mat.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{uBoulderColor:{value:environmentAssets.albedo},uBoulderNormal:{value:environmentAssets.normal}});
  shader.vertexShader='varying vec3 vBoulderP;varying vec3 vBoulderN;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   vec4 boulderWorld=vec4(position,1.);
   #ifdef USE_INSTANCING
    boulderWorld=instanceMatrix*boulderWorld;
   #endif
   vBoulderP=(modelMatrix*boulderWorld).xyz;
   vBoulderN=inverseTransformDirection(transformedNormal,viewMatrix);`);
  shader.fragmentShader='uniform sampler2D uBoulderColor,uBoulderNormal;varying vec3 vBoulderP;varying vec3 vBoulderN;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec3 rockN=normalize(vBoulderN),rockSign=step(vec3(0.),rockN)*2.-1.;
   vec3 rockBlend=pow(abs(rockN),vec3(4.));rockBlend/=max(dot(rockBlend,vec3(1.)),.0001);
   vec3 rockP=vBoulderP*.24;
   vec2 rockX=vec2(-rockSign.x*rockP.z,rockP.y),rockY=vec2(rockP.x,-rockSign.y*rockP.z),rockZ=vec2(rockSign.z*rockP.x,rockP.y);
   vec3 rockPhoto=texture2D(uBoulderColor,rockX).rgb*rockBlend.x+texture2D(uBoulderColor,rockY).rgb*rockBlend.y+texture2D(uBoulderColor,rockZ).rgb*rockBlend.z;
   float rockLuma=dot(rockPhoto,vec3(.2126,.7152,.0722));
   // The aerial scan contains moss. Keep its relief while suppressing green grass patches on a single boulder.
   float moss=smoothstep(.012,.07,rockPhoto.g-(rockPhoto.r+rockPhoto.b)*.5);
   vec3 mineral=mix(rockPhoto,vec3(rockLuma)*vec3(1.04,1.01,.95),.62+moss*.32);
   float bedding=.5+.5*sin(vBoulderP.y*3.3+vBoulderP.x*.4+vBoulderP.z*.23);
   diffuseColor.rgb*=(mineral*1.65+vec3(.012,.012,.011))*(.88+bedding*.12);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(.98-rockLuma*.2,.86,.98);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   vec2 dxX=dFdx(rockX),dyX=dFdy(rockX),dxY=dFdx(rockY),dyY=dFdy(rockY),dxZ=dFdx(rockZ),dyZ=dFdy(rockZ);
   float stoneDetail=1.-smoothstep(90.,220.,distance(cameraPosition,vBoulderP));
   if(stoneDetail>.01){
    vec3 nx=textureGrad(uBoulderNormal,rockX,dxX,dyX).xyz*2.-1.,ny=textureGrad(uBoulderNormal,rockY,dxY,dyY).xyz*2.-1.,nz=textureGrad(uBoulderNormal,rockZ,dxZ,dyZ).xyz*2.-1.;
    vec3 detail=vec3(0.,nx.y,-nx.x*rockSign.x)*rockBlend.x/max(nx.z,.4)+vec3(ny.x,0.,-ny.y*rockSign.y)*rockBlend.y/max(ny.z,.4)+vec3(nz.x*rockSign.z,nz.y,0.)*rockBlend.z/max(nz.z,.4);
    detail-=rockN*dot(detail,rockN);
    normal=normalize(normal+mat3(viewMatrix)*detail*.48*stoneDetail);
   }`);
 };
 mat.customProgramCacheKey=()=> 'coastal-boulder-scan-v1';
 return mat;
}
