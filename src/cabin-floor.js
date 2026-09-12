import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Opaque cabin tub: road geometry must never show through the driver's footwell. */
export function createCabinFloor(){
 const root=new THREE.Group();root.name='Cabin floor and toe board';
 const geometries=[],materials=[];
 const material=options=>{const m=new THREE.MeshStandardMaterial(options);materials.push(m);return m;};
 const carpet=material({color:'#253035',roughness:1,metalness:0,envMapIntensity:.25,emissive:'#10181b',emissiveIntensity:.12});
 const rubber=material({color:'#11191d',roughness:.95,metalness:0,envMapIntensity:.2});
 const alloy=material({color:'#788487',roughness:.52,metalness:.52});
 function box(name,size,position,m=carpet,angle=0){const g=new THREE.BoxGeometry(...size);geometries.push(g);const mesh=new THREE.Mesh(g,m);mesh.name=name;mesh.position.set(...position);mesh.rotation.x=angle;mesh.castShadow=false;mesh.receiveShadow=false;root.add(mesh);return mesh;}
 // The sides overlap the door sills; the toe board meets the underside of the dashboard.
 box('Sealed floor slab',[1.66,.065,2.17],[0,.235,-.345]);
 const rise=.2525,run=.30,angle=-Math.atan2(rise,run);
 box('Sloped front footwell',[1.66,.07,Math.hypot(rise,run)],[0,.39375,.78],carpet,angle);
 box('Dashboard lower closure',[1.66,.13,.10],[0,.535,.963]);
 box('Rear floor closure',[1.66,.30,.08],[0,.36,-1.38]);
 for(const side of[-1,1]){
  box('Inner sill '+side,[.09,.15,2.24],[side*.79,.30,-.24]);
  box('Foot mat '+side,[.65,.010,.91],[side*.385,.273,-.005],rubber);
 }
 box('Brake pedal',[.077,.075,.028],[.435,.368,.60],alloy,-.27);
 box('Accelerator pedal',[.047,.116,.025],[.278,.333,.575],alloy,-.27);
 for(const [x,y,z,w,n] of [[.435,.368,.580,.061,3],[.278,.333,.557,.032,5]])for(let i=0;i<n;i++)box('Pedal grip',[w,.007,.006],[x,y+(i-(n-1)/2)*.018,z],rubber,-.27);
 // The static tub shares one draw per material, keeping the enclosed footwell inexpensive.
 const batches=new Map();
 for(const mesh of root.children){mesh.updateMatrix();mesh.geometry.applyMatrix4(mesh.matrix);if(!batches.has(mesh.material))batches.set(mesh.material,[]);batches.get(mesh.material).push(mesh.geometry);}
 root.clear();
 const combined=[];for(const [m,list]of batches){const g=mergeGeometries(list,false);combined.push(g);const mesh=new THREE.Mesh(g,m);mesh.name='Cabin floor surfaces';root.add(mesh);}
 for(const g of geometries)g.dispose();geometries.splice(0,geometries.length,...combined);
 root.updateMatrixWorld(true);
 return {root,dispose(){for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}};
}
