import {westernValleyHeight,SCENIC_SECTIONS} from './scenic-sections.js';
import {distantRidgeHeight,distantRidgeColor} from './distant-mountain-shape.js';
export {distantRidgeHeight} from './distant-mountain-shape.js';
import {environmentAssets} from './environment-assets.js';
import * as THREE from 'three';
import {createCoastalHeightTexture} from './ocean.js';

// World-space materials keep ground detail consistent across long road sections.
const noiseGLSL=`
float thash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float tnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(thash(i),thash(i+vec2(1,0)),f.x),mix(thash(i+vec2(0,1)),thash(i+vec2(1,1)),f.x),f.y);}
float tfbm(vec2 p){return tnoise(p)*.53+tnoise(p*2.07)*.27+tnoise(p*4.13)*.13+tnoise(p*8.3)*.07;}`;
const wave=(x,z)=>Math.sin(x*.013+Math.sin(z*.006)*2)*Math.cos(z*.019)+Math.sin(x*.038+z*.023)*.28;

export function terrainMaterial({distant=false,weather={}}={}){
 const mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.97,envMapIntensity:distant?.08:.15,vertexColors:distant});
 mat.onBeforeCompile=shader=>{
  shader.uniforms.uRockColor={value:environmentAssets.albedo};
  if(distant){
   shader.uniforms.uMountainDaylight=weather.daylight||{value:1};shader.uniforms.uMountainWet=weather.wet||{value:0};
   shader.uniforms.uMountainNight=weather.night||{value:0};shader.uniforms.uMountainSun=weather.sunDir||{value:new THREE.Vector3(-.56,.32,.77).normalize()};
  }
  if(!distant){shader.uniforms.uRockNormal={value:environmentAssets.normal};shader.uniforms.uGrassColor={value:environmentAssets.grass?.diffuse||environmentAssets.albedo};shader.uniforms.uGrassNormal={value:environmentAssets.grass?.normal||environmentAssets.normal};}
  shader.vertexShader='varying vec3 vTerrainP;varying vec3 vTerrainN;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTerrainP=(modelMatrix*vec4(position,1.)).xyz;vTerrainN=normalize(mat3(modelMatrix)*normal);');
  shader.fragmentShader=(distant?'uniform sampler2D uRockColor;uniform float uMountainDaylight,uMountainWet,uMountainNight;uniform vec3 uMountainSun;':'uniform sampler2D uRockColor,uRockNormal,uGrassColor,uGrassNormal;')+'varying vec3 vTerrainP;varying vec3 vTerrainN;\n'+noiseGLSL+'\n'+shader.fragmentShader;
  if(distant){
   // The front ridge fills much of the screen even from the road. Reuse
   // the existing scan as mineral luminance, with no new normal/roughness
   // samplers. Compressed vertical coverage suggests eroded bedding without
   // painting the scan's green plants over an entire mountain.
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    vec3 p=vTerrainP;
    vec3 mountainBlend=pow(abs(normalize(vTerrainN)),vec3(4.));
    mountainBlend/=mountainBlend.x+mountainBlend.y+mountainBlend.z;
    vec3 mountainUv=p/vec3(42.,26.,42.);
    vec3 mineralPhoto=texture2D(uRockColor,mountainUv.zy).rgb*mountainBlend.x+
                      texture2D(uRockColor,mountainUv.xz).rgb*mountainBlend.y+
                      texture2D(uRockColor,mountainUv.xy).rgb*mountainBlend.z;
    float mineralLuma=dot(mineralPhoto,vec3(.299,.587,.114));
    float mountainDetail=1.-smoothstep(600.,2600.,distance(cameraPosition,p));
    float mineralContrast=clamp((mineralLuma-.24)*2.1,-.42,.52);
    diffuseColor.rgb*=1.+mineralContrast*mix(.10,.90,mountainDetail);`);
   // Reuse the already sampled scan as metre-scale mineral relief. Screen
   // derivatives add no texture lookups; snow and distant haze suppress it.
   shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
    float bareMineral=1.-smoothstep(.34,.62,dot(vColor,vec3(.299,.587,.114)));
    float reliefHeight=mineralLuma*.75*mountainDetail*bareMineral;
    vec3 ridgeDx=dFdx(-vViewPosition),ridgeDy=dFdy(-vViewPosition);
    vec3 ridgeR1=cross(ridgeDy,normal),ridgeR2=cross(normal,ridgeDx);
    float ridgeDet=dot(ridgeDx,ridgeR1)*faceDirection;
    vec3 ridgeGradient=sign(ridgeDet)*(dFdx(reliefHeight)*ridgeR1+dFdy(reliefHeight)*ridgeR2);
    normal=normalize(max(abs(ridgeDet),.000001)*normal-ridgeGradient);
   `);
   // Match the existing sky's clear/sunset/rain/night palette. Height thins
   // clear-air haze around summits; dense weather still uses the game's fog.
   // This replaces the normal fog blend, with no extra pass or texture read.
   shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>',`
    #ifdef USE_FOG
     vec3 mountainRay=normalize(vTerrainP-cameraPosition);
     float mountainDistance=distance(vTerrainP,cameraPosition);
     #ifdef FOG_EXP2
      float clearAir=1.-smoothstep(.0007,.0015,fogDensity);
      float summitAir=mix(1.,.70,clearAir*smoothstep(70.,600.,vTerrainP.y));
      float mountainFog=1.-exp(-pow(fogDensity*mountainDistance*summitAir,2.));
     #else
      float clearAir=0.;float mountainFog=smoothstep(fogNear,fogFar,mountainDistance);
     #endif
     vec3 mountainHorizon=mix(vec3(.68,.49,.32),vec3(.45,.65,.77),uMountainDaylight);
     vec3 mountainZenith=mix(vec3(.065,.17,.28),vec3(.045,.20,.39),uMountainDaylight);
     vec3 mountainAir=mix(mountainHorizon,mountainZenith,pow(smoothstep(-.05,.85,mountainRay.y),.43));
     mountainAir+=vec3(.46,.22,.08)*pow(max(dot(mountainRay,uMountainSun),0.),5.)*(1.-uMountainDaylight*.7)*(1.-uMountainWet);
     mountainAir=mix(mountainAir,vec3(.30,.38,.42)+mountainAir*.15,uMountainWet*.70);
     mountainAir=mix(mountainAir,vec3(.009,.020,.044)+mountainAir*.035,uMountainNight);
     mountainAir=mix(fogColor,mountainAir,clearAir*.75);
     gl_FragColor.rgb=mix(gl_FragColor.rgb,mountainAir,mountainFog);
    #endif
   `);
   return;
  }
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec3 p=vTerrainP,terrainN=normalize(vTerrainN);float slope=1.-abs(terrainN.y);
   float broad=tfbm(p.xz*.012),mottle=tnoise(p.xz*.15);
   float terrainDetail=1.-smoothstep(100.,260.,distance(cameraPosition,p));
   float strata=tnoise(vec2(p.x*.026+p.z*.018,p.y*.16+broad*1.3));
   vec3 grassPhoto=texture2D(uGrassColor,p.xz*.5).rgb;
   vec3 grass=grassPhoto*mix(vec3(.41,.63,.36),vec3(.69,.77,.47),smoothstep(.25,.73,broad));
   grass*=.83+mottle*.22;
   vec3 blend=pow(abs(terrainN),vec3(4.));blend/=blend.x+blend.y+blend.z;
   // Six metre coverage is a visual calibration for this scene, not a claim
   // about the scan's measured dimensions. All projections share this scale.
   vec3 rockP=p/6.;
   vec3 stone=texture2D(uRockColor,rockP.zy).rgb*blend.x+texture2D(uRockColor,rockP.xz).rgb*blend.y+texture2D(uRockColor,rockP.xy).rgb*blend.z;
   // The aerial scan includes plants: neutralize their green dominance only
   // on exposed mineral surfaces, retaining photographed cracks and strata.
   float mineral=dot(stone,vec3(.299,.587,.114));
   float vegetation=smoothstep(.005,.095,stone.g-max(stone.r,stone.b));
   stone=mix(stone,vec3(mineral)*vec3(1.04,1.01,.93),.42+vegetation*.43);
   stone*=.78+broad*.17+strata*.18;
   float bare=smoothstep(.48,.70,broad+mottle*.12)*(.28+slope*.64);
   vec3 soil=vec3(.135,.112,.079)*(.83+mottle*.28);
   grass=mix(grass,soil,bare);
   // Broad, connected rock outcrops also reach gentle hillsides; slope alone
   // previously left almost the entire roadside as a uniform grass blanket.
   float outcrop=smoothstep(.59,.74,broad+strata*.15);
   float rock=clamp(smoothstep(.08,.38,slope+broad*.045)+outcrop*.66,0.,1.);
   vec3 ground=mix(grass,stone,rock);
   float sand=(1.-smoothstep(-1.,14.,p.y))*.75;
   ground=mix(ground,vec3(.25,.235,.17)*(mottle*.3+.8),sand);
   diffuseColor.rgb=ground;`);
  // A mineral finish can share the photographed luminance. This replaces the
  // old roughness lookup which projected horizontally even on vertical faces.
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.97,clamp(.83+mineral*.13,.83,.98),rock);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   vec3 grassRelief=vec3(0.),rockRelief=vec3(0.);
   // Derivatives precede divergent surface branches so mip selection remains
   // defined at grass/rock boundaries, including during fast driving.
   vec3 terrainDx=dFdx(p),terrainDy=dFdy(p);
   if(terrainDetail>.001){
    if(rock<.98){
     vec2 grassMapped=textureGrad(uGrassNormal,p.xz*.5,terrainDx.xz*.5,terrainDy.xz*.5).xy*2.-1.;
     grassRelief=vec3(grassMapped.x,0.,grassMapped.y)*.19;
    }
    if(rock>.02){
     vec2 nx=textureGrad(uRockNormal,rockP.zy,terrainDx.zy/6.,terrainDy.zy/6.).xy*2.-1.;
     vec2 ny=textureGrad(uRockNormal,rockP.xz,terrainDx.xz/6.,terrainDy.xz/6.).xy*2.-1.;
     vec2 nz=textureGrad(uRockNormal,rockP.xy,terrainDx.xy/6.,terrainDy.xy/6.).xy*2.-1.;
     rockRelief=(vec3(0.,nx.y,nx.x)*blend.x+vec3(ny.x,0.,ny.y)*blend.y+vec3(nz.x,nz.y,0.)*blend.z)*.52;
    }
   }
   vec3 relief=mix(grassRelief,rockRelief,rock);
   // Project the normal-map perturbation into the geometric tangent plane.
   // A neutral map now leaves every slope unchanged instead of tilting it.
   relief-=terrainN*dot(terrainN,relief);
   normal=normalize(normal+mat3(viewMatrix)*relief*terrainDetail);`);
 };
 mat.customProgramCacheKey=()=>`coast-terrain-${distant?'far-v7':'near-v6'}`;
 return mat;
}

// Mineral and vegetation regions are baked on the complete surface before
// tiling so adjacent chunks share exactly the same colors and normals.
function ridgeColors(geometry,columns,rows,layer){
 const p=geometry.attributes.position,n=geometry.attributes.normal,colors=[];
 for(let i=0;i<p.count;i++)colors.push(...distantRidgeColor(p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i),layer));
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
}

// Normals are calculated on the complete original surface before splitting.
// Copying them keeps adjacent tiles identical, including the road-side hills.
function addGridTiles(world, source, columns, rows, tileColumns, tileRows, material, name, shadow){
 const srcP=source.attributes.position.array,srcN=source.attributes.normal.array,srcC=source.attributes.color?.array;
 let count=0;
 for(let z0=0;z0<rows;z0+=tileRows)for(let x0=0;x0<columns;x0+=tileColumns){
  const width=Math.min(tileColumns,columns-x0),height=Math.min(tileRows,rows-z0),positions=[],normals=[],colors=[],indices=[];
  for(let z=0;z<=height;z++)for(let x=0;x<=width;x++){
   const i=((z0+z)*(columns+1)+x0+x)*3;
   positions.push(srcP[i],srcP[i+1],srcP[i+2]);normals.push(srcN[i],srcN[i+1],srcN[i+2]);if(srcC)colors.push(srcC[i],srcC[i+1],srcC[i+2]);
  }
  for(let z=0;z<height;z++)for(let x=0;x<width;x++){const a=z*(width+1)+x,b=a+width+1;indices.push(a,b,a+1,a+1,b,b+1);}
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setIndex(indices);
  if(srcC)geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const tile=new THREE.Mesh(geometry,material);tile.name=`${name} ${x0}:${z0}`;
  tile.castShadow=shadow;tile.receiveShadow=shadow;tile.userData.terrainTile=true;world.scene.add(tile);count++;
 }
 source.dispose();return count;
}

export function buildCoastalTerrain(world){
 const extended=!!world.track.legacyTrack,track=world.track.legacyTrack||world.track,sampled=track.samples.filter((_,i)=>i%3===0);
 // Match the existing driving surface; outside the verge, erosion breaks up the hills.
 world.groundHeight=(x,z)=>{
  let nearest=sampled[0],min=Infinity,nearIndex=0;
  for(let i=0;i<sampled.length;i++){
   const q=sampled[i],d=(x-q.p.x)**2+(z-q.p.z)**2;
   if(d<min){min=d;nearest=q;nearIndex=i;}
  }
  const distance=Math.sqrt(min),side=(x-nearest.p.x)*nearest.right.x+(z-nearest.p.z)*nearest.right.z,t=nearIndex/sampled.length;
  const offshore=t>.90&&t<.993;
  if(offshore&&distance<110)return -12;
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
  let original=Math.max(-14,nearHeight*(1-smooth)+(weightSum?heightSum/weightSum+erosion:nearHeight)*smooth);
  // A graded shoreline replaces the old abrupt 145 m underwater cut.
  if(offshore&&distance<240){let shore=Math.max(0,Math.min(1,(distance-110)/130));shore=shore*shore*(3-2*shore);original=-12*(1-shore)+original*shore;}
  return extended?original:westernValleyHeight(original,nearIndex*3/track.count,distance);
 };
 const nx=210,nz=275,minX=-500,minZ=-1200,w=2300,h=3400,pos=[],idx=[];
 for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){
  const wx=minX+x/nx*w,wz=minZ+z/nz*h;pos.push(wx,world.groundHeight(wx,wz),wz);
 }
 for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
  const a=z*(nx+1)+x,b=a+nx+1;idx.push(a,b,a+1,a+1,b,b+1);
 }
 // Reuse the rendered terrain samples so shoreline foam follows the visible coast.
 world.coastalHeightField=createCoastalHeightTexture(pos,nx+1,nz+1,[minX,minZ,w,h]);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();
 const groundMat=terrainMaterial();
 const groundTiles=addGridTiles(world,g,nx,nz,42,55,groundMat,'Coastal ground tile',true);
 world.terrainStats={groundTriangles:nx*nz*2,groundTiles,ridgeTriangles:0,ridgeTiles:0};
 for(const side of[-1,1]){
  const vg=track.ribbon(side<0?-20:10.3,side<0?-10.3:20,-.2);
  for(let i=0;i<vg.attributes.position.count;i++){
   const t=Math.floor(i/2)/track.count,a=vg.attributes.position;
   if(t>(extended?.89:.90)&&t<.993)a.setY(i,-32);
   else if(!extended&&t>=SCENIC_SECTIONS.sichuan.start&&t<=SCENIC_SECTIONS.sichuan.end)a.setY(i,world.groundHeight(a.getX(i),a.getZ(i))-.06);
  }
  vg.computeVertexNormals();const verge=new THREE.Mesh(vg,groundMat);verge.receiveShadow=true;world.scene.add(verge);
 }
 // Broad, asymmetrical ridges replace repeated cone-shaped mountains.
 const mountainMat=terrainMaterial({distant:true,weather:world.uniforms});
 for(let layer=0;layer<3;layer++){
  const rows=54,cols=210,positions=[],indices=[];
  for(let z=0;z<=rows;z++)for(let x=0;x<=cols;x++){
   const wx=-2600+x/cols*5900,wz=1450+layer*560+z/rows*1150;
   const ridge=distantRidgeHeight(wx,wz,z/rows,layer);
   positions.push(wx,-29+Math.max(0,ridge),wz);
  }
  for(let z=0;z<rows;z++)for(let x=0;x<cols;x++){const a=z*(cols+1)+x,b=a+cols+1;indices.push(a,b,a+1,a+1,b,b+1);}
  const ridgeGeo=new THREE.BufferGeometry();ridgeGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));ridgeGeo.setIndex(indices);ridgeGeo.computeVertexNormals();ridgeColors(ridgeGeo,cols,rows,layer);
  // These horizon ridges lie beyond the road shadow receiver area.
  world.terrainStats.ridgeTiles+=addGridTiles(world,ridgeGeo,cols,rows,30,54,mountainMat,`Horizon ridge ${layer}`,false);
  world.terrainStats.ridgeTriangles+=cols*rows*2;
 }
}
