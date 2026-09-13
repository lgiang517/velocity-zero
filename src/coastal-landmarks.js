import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

export const LANDMARK_SITES=[
 {s:135,d:32,scale:1.1,turn:.18},{s:485,d:29,scale:1.25,turn:-.24},
 {s:890,d:-34,scale:.9,turn:.6},{s:1440,d:34,scale:1.4,turn:-.35},
 {s:2610,d:31,scale:1,turn:.38},{s:4550,d:-35,scale:1.15,turn:-.2},
 {s:5590,d:32,scale:1.3,turn:.55},{s:6090,d:-36,scale:.95,turn:-.45}
];
const PROFILES={high:{near:150,mid:430,far:1100},balanced:{near:85,mid:280,far:820},touch:{near:0,mid:160,far:620},low:{near:0,mid:65,far:480}};
export function landmarkProfile(quality,coarse=false){return PROFILES[quality==='high'?'high':quality==='low'?'low':coarse?'touch':'balanced'];}
export function selectLandmarkLevel(distance,profile,previous=-1){
 if(profile.near>0&&(distance<profile.near||(previous===0&&distance<profile.near*1.12)))return 0;
 if(distance<profile.mid||(previous===1&&distance<profile.mid*1.12))return 1;
 return 2;
}
export function clearOfRoad(track,position,radius){
 const clearance=11.5+radius;
 return track.samples.every(q=>Math.hypot(position.x-q.p.x,position.z-q.p.z)>=clearance);
}
export function placeLandmarks(track,groundHeight,footprint){
 const result=[];
 for(const site of LANDMARK_SITES){
  const radius=Math.hypot(footprint.x,footprint.z)*.5*site.scale+1.5;
  for(let shift=0;shift<=36;shift+=4){
   const d=site.d+Math.sign(site.d)*shift,p=track.point(site.s,d,0);
   if(!clearOfRoad(track,p,radius))continue;
   p.y=groundHeight(p.x,p.z)-.7*site.scale;
   if(p.y < -3.5)continue;
   result.push({...site,d,p,radius,heading:track.sample(site.s).heading+site.turn});break;
  }
 }
 return result;
}
export async function loadCoastalLandmarks(world){
 const gltf=await new GLTFLoader().loadAsync(import.meta.env.BASE_URL+'models/coastal-rock/coastal-rock-lods.glb');
 const templates=[0,1,2].map(i=>gltf.scene.getObjectByName('CoastalRock_LOD'+i));
 if(templates.some(t=>!t))throw new Error('Coastal rock GLB must contain three named LOD meshes');
 const box=new THREE.Box3().setFromObject(templates[0]),footprint=box.getSize(new THREE.Vector3());
 const sites=placeLandmarks(world.track,world.groundHeight,{x:footprint.x*1.2,z:footprint.z}),instances=[];
 const meshes=new Set(),materials=new Set(),textures=new Set();
 gltf.scene.traverse(o=>{if(!o.isMesh)return;meshes.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);m.envMapIntensity=.38;for(const v of Object.values(m))if(v?.isTexture){v.anisotropy=Math.min(4,world.renderer.capabilities.getMaxAnisotropy());textures.add(v);}}});
 for(const site of sites){
  const root=new THREE.Group();root.name='Lux3D coastal rock '+site.s;root.position.copy(site.p);root.rotation.y=site.heading;root.scale.set(site.scale*1.2,site.scale*.75,site.scale);
  const levels=templates.map((template,i)=>{const copy=template.clone(true);copy.visible=false;copy.traverse(o=>{if(o.isMesh){o.castShadow=i<2;o.receiveShadow=true;}});root.add(copy);return copy;});
  world.scene.add(root);world.prepareShadows(root);instances.push({root,levels,level:-1});
 }
 const stats={instances:instances.length,visible:0,lods:[0,0,0],source:'Aholo Lux3D G1 / Blender 5.2'};
 let lastProfile;
 return{stats,update(camera,quality){
  const coarse=typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches,profile=landmarkProfile(quality,coarse);
  stats.visible=0;stats.lods.fill(0);
  for(const item of instances){
   const distance=camera.position.distanceTo(item.root.position);item.root.visible=distance<profile.far;
   if(!item.root.visible)continue;
   const next=selectLandmarkLevel(distance,profile,lastProfile===profile?item.level:-1);
   if(next!==item.level){item.level=next;item.levels.forEach((o,i)=>o.visible=i===next);}
   stats.visible++;stats.lods[next]++;
  }
  lastProfile=profile;
 },dispose(){for(const {root} of instances)world.scene.remove(root);for(const g of meshes)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();}};
}
