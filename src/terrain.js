import {environmentAssets} from './environment-assets.js';
import * as THREE from 'three';

// World-space materials keep ground detail consistent across long road sections.
const noiseGLSL=`
float thash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float tnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(thash(i),thash(i+vec2(1,0)),f.x),mix(thash(i+vec2(0,1)),thash(i+vec2(1,1)),f.x),f.y);}
float tfbm(vec2 p){return tnoise(p)*.53+tnoise(p*2.07)*.27+tnoise(p*4.13)*.13+tnoise(p*8.3)*.07;}`;
const wave=(x,z)=>Math.sin(x*.013+Math.sin(z*.006)*2)*Math.cos(z*.019)+Math.sin(x*.038+z*.023)*.28;

export function terrainMaterial({distant=false}={}){
 const mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.97,envMapIntensity:distant?.08:.15});
 mat.onBeforeCompile=shader=>{
  if(!distant){shader.uniforms.uRockColor={value:environmentAssets.albedo};shader.uniforms.uRockNormal={value:environmentAssets.normal};shader.uniforms.uRockRough={value:environmentAssets.roughness};}
  shader.vertexShader='varying vec3 vTerrainP;varying vec3 vTerrainN;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTerrainP=(modelMatrix*vec4(position,1.)).xyz;vTerrainN=normalize(mat3(modelMatrix)*normal);');
  shader.fragmentShader=(distant?'':'uniform sampler2D uRockColor,uRockNormal,uRockRough;')+'varying vec3 vTerrainP;varying vec3 vTerrainN;\n'+noiseGLSL+'\n'+shader.fragmentShader;
  // Distant ridges occupy a few pixels: broad strata read better than several
  // triplanar texture/normal samples and high-frequency procedural grain.
  if(distant){
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    vec3 p=vTerrainP;float slope=1.-abs(normalize(vTerrainN).y);
    float broad=tnoise(p.xz*.008),strata=tnoise(vec2(p.x*.013+p.z*.009,p.y*.053));
    vec3 grass=mix(vec3(.056,.083,.049),vec3(.13,.16,.09),broad);
    vec3 stone=mix(vec3(.14,.15,.135),vec3(.27,.255,.21),strata)*(.8+broad*.3);
    float exposed=smoothstep(.12,.49,slope+broad*.12+smoothstep(100.,360.,p.y)*.15);
    diffuseColor.rgb=mix(grass,stone,exposed);`);
   return;
  }
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec3 p=vTerrainP;float slope=1.-abs(normalize(vTerrainN).y);
   float broad=tfbm(p.xz*.031),mottle=tfbm(p.xz*.21);
   float terrainDetail=1.-smoothstep(130.,300.,distance(cameraPosition,p));
   float grain=mix(.5,tnoise(p.xz*2.8),terrainDetail);
   float strata=tnoise(vec2(p.x*.07+p.z*.04,p.y*.32+mottle*2.));
   vec3 grass=mix(vec3(.043,.069,.035),vec3(.137,.174,.087),broad);
   grass*=.77+mottle*.39+grain*.13;
   vec3 blend=pow(abs(normalize(vTerrainN)),vec3(4.));blend/=blend.x+blend.y+blend.z;
   vec3 stone=texture2D(uRockColor,p.zy*.031).rgb*blend.x+texture2D(uRockColor,p.xz*.031).rgb*blend.y+texture2D(uRockColor,p.xy*.031).rgb*blend.z;
   grass=mix(grass,texture2D(uRockColor,p.xz*.055).rgb*vec3(.61,.80,.49),.18);
   // Bedding and patches of warm soil break up the old uniform green slopes.
   stone*=.67+broad*.22+strata*.25;
   stone=mix(stone,stone*vec3(1.10,1.01,.85),smoothstep(.58,.79,strata)*.5);
   float bare=smoothstep(.48,.70,broad+mottle*.14)*(.24+slope*.54);
   vec3 soil=vec3(.155,.123,.076)*(.73+mottle*.43+grain*.17);
   grass=mix(grass,soil,bare);
   float rock=smoothstep(.13,.50,slope+broad*.12);
   vec3 ground=mix(grass,stone,rock);
   float sand=(1.-smoothstep(-1.,14.,p.y))*.75;
   ground=mix(ground,vec3(.25,.235,.17)*(mottle*.3+.8),sand);
   diffuseColor.rgb=ground;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.97,clamp(texture2D(uRockRough,vTerrainP.xz*.031).r*.36+.60,.65,1.),terrainDetail);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   float relief=(tnoise(vTerrainP.xz*1.3)*.025+tnoise(vTerrainP.xz*5.2)*.009)*terrainDetail;
   vec3 sigmaX=dFdx(vViewPosition),sigmaY=dFdy(vViewPosition);
   vec3 r1=cross(sigmaY,normal),r2=cross(normal,sigmaX);
   float det=dot(sigmaX,r1);
   normal=normalize(abs(det)*normal-sign(det)*(dFdx(relief)*r1+dFdy(relief)*r2));
   vec3 mapped=texture2D(uRockNormal,vTerrainP.xz*.031).xyz*2.-1.;
   normal=normalize(normal+mat3(viewMatrix)*vec3(mapped.x,0.,mapped.y)*mix(.14,.42,rock)*terrainDetail);`);
 };
 mat.customProgramCacheKey=()=>`coast-terrain-${distant?'far':'near'}-v3`;
 return mat;
}

// Normals are calculated on the complete original surface before splitting.
// Copying them keeps adjacent tiles identical, including the road-side hills.
function addGridTiles(world, source, columns, rows, tileColumns, tileRows, material, name, shadow){
 const srcP=source.attributes.position.array,srcN=source.attributes.normal.array;
 let count=0;
 for(let z0=0;z0<rows;z0+=tileRows)for(let x0=0;x0<columns;x0+=tileColumns){
  const width=Math.min(tileColumns,columns-x0),height=Math.min(tileRows,rows-z0),positions=[],normals=[],indices=[];
  for(let z=0;z<=height;z++)for(let x=0;x<=width;x++){
   const i=((z0+z)*(columns+1)+x0+x)*3;
   positions.push(srcP[i],srcP[i+1],srcP[i+2]);normals.push(srcN[i],srcN[i+1],srcN[i+2]);
  }
  for(let z=0;z<height;z++)for(let x=0;x<width;x++){const a=z*(width+1)+x,b=a+width+1;indices.push(a,b,a+1,a+1,b,b+1);}
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setIndex(indices);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const tile=new THREE.Mesh(geometry,material);tile.name=`${name} ${x0}:${z0}`;
  tile.castShadow=shadow;tile.receiveShadow=shadow;tile.userData.terrainTile=true;world.scene.add(tile);count++;
 }
 source.dispose();return count;
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
 const groundMat=terrainMaterial();
 const groundTiles=addGridTiles(world,g,nx,nz,42,55,groundMat,'Coastal ground tile',true);
 world.terrainStats={groundTriangles:nx*nz*2,groundTiles,ridgeTriangles:0,ridgeTiles:0};
 for(const side of[-1,1]){
  const vg=track.ribbon(side<0?-20:10.3,side<0?-10.3:20,-.2);
  for(let i=0;i<vg.attributes.position.count;i++){const t=Math.floor(i/2)/track.count;if(t>.90&&t<.993)vg.attributes.position.setY(i,-14);}
  vg.computeVertexNormals();const verge=new THREE.Mesh(vg,groundMat);verge.receiveShadow=true;world.scene.add(verge);
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
  // These horizon ridges lie beyond the road shadow receiver area.
  world.terrainStats.ridgeTiles+=addGridTiles(world,ridgeGeo,cols,rows,30,54,mountainMat,`Horizon ridge ${layer}`,false);
  world.terrainStats.ridgeTriangles+=cols*rows*2;
 }
}
