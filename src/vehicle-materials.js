import * as THREE from 'three';

/** Texture-free paint finish; coarse traffic cars keep the standard shader. */
export function refineVehicleMaterial(material,{simple=false}={}){
 const m=material;
 if(m.name==='Paint'){
  m.metalness=.38;m.envMapIntensity=.94;
  m.userData.vehicleFinish={dryRoughness:.29,wetRoughness:.19,dryCoat:.15,wetCoat:.075};
  if(m.isMeshPhysicalMaterial)m.clearcoat=1;
  setVehicleWetness(m,0);
  if(!simple){
   m.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vVehicleFinish;').replace('#include <begin_vertex>','#include <begin_vertex>\nvVehicleFinish = position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vVehicleFinish;').replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      vec3 finishPhase = vVehicleFinish * vec3(148.0, 173.0, 157.0);
      vec3 finishFootprint = fwidth(finishPhase);
      float finishVisibility = 1.0 - smoothstep(0.6, 2.4, max(finishFootprint.x, max(finishFootprint.y, finishFootprint.z)));
      float finishGrain = sin(finishPhase.x) * sin(finishPhase.y + 1.7) * sin(finishPhase.z + 0.8);
      roughnessFactor = clamp(roughnessFactor + finishGrain * 0.012 * finishVisibility, 0.15, 1.0);
    `).replace('#include <clearcoat_normal_fragment_maps>',`#include <clearcoat_normal_fragment_maps>
      #ifdef USE_CLEARCOAT
       // Microscopic coating relief is filtered before it can sparkle at a distance.
       vec3 coatPhase = vVehicleFinish * vec3(420.0, 263.0, 377.0);
       vec3 coatFootprint = fwidth(coatPhase);
       float coatVisibility = 1.0 - smoothstep(0.55, 2.1, max(coatFootprint.x, max(coatFootprint.y, coatFootprint.z)));
       float coatRelief = sin(coatPhase.x + sin(coatPhase.y)) * sin(coatPhase.z + sin(coatPhase.x * 0.51)) * 0.000035 * coatVisibility;
       vec3 coatDx = dFdx(-vViewPosition), coatDy = dFdy(-vViewPosition);
       vec3 coatRx = cross(coatDy, clearcoatNormal), coatRy = cross(clearcoatNormal, coatDx);
       float coatDet = dot(coatDx, coatRx);
       vec2 coatGradient = vec2(dFdx(coatRelief), dFdy(coatRelief));
       if (abs(coatDet) > 1e-12) clearcoatNormal = normalize(abs(coatDet) * clearcoatNormal - sign(coatDet) * (coatGradient.x * coatRx + coatGradient.y * coatRy));
      #endif
    `);
   };
   m.customProgramCacheKey=()=> 'vehicle-paint-finish-v2';
  }
 }else if(m.name==='Window glass'){
  // Thin automotive glazing preserves PBR reflection energy without an extra scene render.
  m.map=null;m.normalMap=null;m.roughnessMap=null;m.metalnessMap=null;m.alphaMap=null;
  m.color.set('#b6cbc5');m.metalness=0;m.roughness=.045;m.envMapIntensity=.82;
  m.transparent=true;m.opacity=.18;m.depthWrite=false;m.side=THREE.DoubleSide;m.forceSinglePass=true;
  if(m.isMeshPhysicalMaterial){m.transmission=0;m.clearcoat=0;m.ior=1.52;}
  m.onBeforeCompile=shader=>{
   shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`#include <opaque_fragment>
    float glazingNV = abs(dot(normal, normalize(vViewPosition)));
    float glazingFresnel = 0.0426 + 0.9574 * pow(1.0 - glazingNV, 5.0);
    float glazingOpacity = 0.36 + 0.64 * glazingFresnel;
    vec3 glazingReflection = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
    gl_FragColor = vec4(glazingReflection / glazingOpacity + diffuseColor.rgb * 0.025, glazingOpacity);
   `);
  };
  m.customProgramCacheKey=()=> 'vehicle-thin-glazing-v1';
 }else if(m.name==='Glass'){
  m.color.set('#b8c5c8');m.metalness=.95;m.roughness=.075;m.envMapIntensity=1.0;
  if(m.isMeshPhysicalMaterial){m.transmission=0;m.clearcoat=0;m.ior=1.5;}
 }else if(m.name==='Graphite'){
  if(!m.userData.preserveColor){m.color.set('#182128');m.metalness=.24;m.roughness=.46;}else{m.metalness=Math.min(m.metalness,.25);m.roughness=Math.max(m.roughness,.45);}m.envMapIntensity=.65;
 }else if(m.name==='Alloy'){
  m.metalness=.88;m.roughness=.23;m.envMapIntensity=1.0;
 }else if(m.name==='Intake mesh'){
  m.metalness=.22;m.roughness=.64;m.envMapIntensity=.45;
 }else if(m.name==='Headlight'){
  // Preserve visible projector components instead of filling the whole housing with bloom.
  m.roughness=.19;m.metalness=.12;m.emissiveIntensity=1.6;
 }else if(m.name==='Tail'){
  m.roughness=.24;m.metalness=.08;
 }
 if(m.name!=='Window glass')m.side=THREE.FrontSide;m.shadowSide=THREE.FrontSide;
 return m;
}

/** Keep the external body and the separate driver's hood on the same weather response. */
export function setVehicleWetness(material,wet=0){
 const finish=material.userData.vehicleFinish;if(!finish)return;
 const amount=Number.isFinite(wet)?THREE.MathUtils.clamp(wet,0,1):0;
 material.roughness=THREE.MathUtils.lerp(finish.dryRoughness,finish.wetRoughness,amount);
 if(material.isMeshPhysicalMaterial)material.clearcoatRoughness=THREE.MathUtils.lerp(finish.dryCoat,finish.wetCoat,amount);
}
