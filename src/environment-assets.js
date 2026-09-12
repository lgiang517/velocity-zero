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
 });
 return loading;
}
