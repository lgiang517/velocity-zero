import * as THREE from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
export const environmentAssets={};
let loading;
export function loadEnvironmentAssets(){
 if(loading)return loading;
 const loader=new THREE.TextureLoader(),base=import.meta.env.BASE_URL+'textures/';
 loading=Promise.all([
  loader.loadAsync(base+'aerial_rocks_04-diffuse.jpg'),
  loader.loadAsync(base+'aerial_rocks_04-nor_gl.jpg'),
  loader.loadAsync(base+'aerial_rocks_04-rough.jpg'),
  new HDRLoader().loadAsync(base+'venice_sunset-hdri.hdr')
 ]).then(([albedo,normal,roughness,sky])=>{
  albedo.colorSpace=THREE.SRGBColorSpace;
  for(const map of[albedo,normal,roughness]){map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=4;}
  sky.mapping=THREE.EquirectangularReflectionMapping;
  Object.assign(environmentAssets,{albedo,normal,roughness,sky});
  return Promise.all([loadRoadsideTextures(loader,base),loadVegetationTextures(loader,base),loadLandscapeTextures(loader,base)]);
 });
 return loading;
}

async function loadRoadsideTextures(loader,base){
 const entries=await Promise.all(['plaster','roof','wood'].map(async type=>{
  try{
   const [diffuse,normal,rough]=await Promise.all(['diffuse','normal','rough'].map(role=>loader.loadAsync(base+'roadside/'+type+'-'+role+'.jpg')));
   diffuse.colorSpace=THREE.SRGBColorSpace;
   for(const map of[diffuse,normal,rough]){map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=4;}
   return [type,{diffuse,normal,rough,metres:type==='roof'?3:1.5}];
  }catch(error){console.warn('Roadside texture unavailable; using fallback finish',type);return [type,null];}
 }));
 environmentAssets.roadside=Object.fromEntries(entries);
}

async function loadVegetationTextures(loader,base){
 const entries=await Promise.all([['pine','pine-twig.webp','pine-twig-normal.jpg'],['broadleaf','broadleaf.webp','broadleaf-normal.jpg'],['bark','pine-bark-diffuse.jpg','pine-bark-normal.jpg']].map(async([type,color,relief])=>{
  try{const [diffuse,normal]=await Promise.all([color,relief].map(file=>loader.loadAsync(base+'vegetation/'+file)));
   diffuse.colorSpace=THREE.SRGBColorSpace;diffuse.anisotropy=4;normal.anisotropy=4;
   if(type==='bark')for(const map of[diffuse,normal]){map.wrapS=map.wrapT=THREE.RepeatWrapping;}
   return [type,{diffuse,normal}];
  }catch(error){console.warn('Vegetation texture unavailable; using fallback',type);return[type,null];}
 }));environmentAssets.vegetation=Object.fromEntries(entries);
}

async function loadLandscapeTextures(loader,base){
 try{
  const [diffuse,normal]=await Promise.all(['diffuse','normal'].map(role=>loader.loadAsync(base+'landscape/grass-'+role+'.jpg')));
  diffuse.colorSpace=THREE.SRGBColorSpace;
  for(const map of [diffuse,normal]){map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=4;}
  environmentAssets.grass={diffuse,normal,metres:2};
 }catch(error){console.warn('Grass texture unavailable; using ground fallback');}
}
