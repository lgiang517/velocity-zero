import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Exterior-only cabin, attached to the sprung/scaled body. Template GPU resources stay caller-owned. */
export function createCabinInterior({simple=false,seatTemplate=null}={}){
 const root=new THREE.Group();root.name='Window-visible cabin';
 const ownedGeometry=new Set(),ownedMaterials=new Set(),seatGroup=new THREE.Group();seatGroup.name='Front seats';root.add(seatGroup);
 const mat=options=>{const m=new THREE.MeshStandardMaterial(options);ownedMaterials.add(m);return m;};
 const leather=mat({color:'#343737',roughness:.84,metalness:.015,envMapIntensity:.42});
 const carpet=mat({color:'#151b20',roughness:1,envMapIntensity:.24});
 const satin=mat({color:'#8b918e',metalness:.68,roughness:.4,envMapIntensity:.62});
 const batches=new Map();
 function piece(g,m,pos,rotation=[0,0,0],bucket=batches){g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(1,1,1)));if(!bucket.has(m))bucket.set(m,[]);bucket.get(m).push(g);}
 function box(size,pos,m=leather,r=.025,rotation=[0,0,0],bucket=batches){piece(simple?new THREE.BoxGeometry(...size):new RoundedBoxGeometry(...size,1,Math.min(r,Math.min(...size)*.4)),m,pos,rotation,bucket);}
 function merge(bucket,parent){for(const [m,list]of bucket){const flat=list.map(g=>g.index?g.toNonIndexed():g);for(const g of flat)for(const attr of Object.keys(g.attributes))if(!['position','normal','uv'].includes(attr))g.deleteAttribute(attr);const joined=mergeGeometries(flat,false);for(let i=0;i<list.length;i++){list[i].dispose();if(flat[i]!==list[i])flat[i].dispose();}if(!joined)throw new Error('Cabin merge failed');ownedGeometry.add(joined);const mesh=new THREE.Mesh(joined,m);mesh.castShadow=false;mesh.receiveShadow=true;parent.add(mesh);}}
 // Closed tub and front bulkhead eliminate road visibility through transparent glass.
 box([1.36,.065,1.96],[0,.255,-.20],carpet,.004);
 box([1.36,.25,.10],[0,.38,-1.13],carpet,.008);
 box([1.36,.38,.10],[0,.45,.73],carpet,.008);
 for(const side of[-1,1]){
  box([.055,.40,1.92],[side*.67,.46,-.20],leather,.02);
  box([.065,.16,1.65],[side*.665,.71,-.24],leather,.028);
  box([.060,.05,.54],[side*.64,.61,-.37],leather,.015);
  if(!simple)box([.019,.013,.24],[side*.604,.633,-.31],satin,.004);
 }
 // Shallow dashboard and instrument hood remain below the existing windscreen aperture.
 box([1.32,.18,.30],[0,.728,.615],leather,.06);
 box([.39,.10,.13],[.35,.814,.56],carpet,.035);
 box([.23,.23,.23],[-.09,.53,.40],leather,.025);
 box([.235,.12,.65],[-.08,.355,.04],leather,.025);
 if(!simple){box([.018,.11,.038],[-.08,.45,.22],satin,.006);box([.053,.037,.06],[-.08,.515,.22],leather,.011);}
 // A separate local pivot follows the same steering ratio as the driver cockpit.
 const steeringWheel=new THREE.Group();steeringWheel.name='Exterior steering wheel';steeringWheel.position.set(.35,.78,.17);root.add(steeringWheel);
 const wheelBatch=new Map();
 piece(new THREE.TorusGeometry(.142,.014,simple?5:6,simple?20:40),leather,[0,0,0],[0,0,0],wheelBatch);
 box([.076,.058,.032],[0,0,-.01],leather,.018,[0,0,0],wheelBatch);
 for(const angle of[0,Math.PI*.72,-Math.PI*.72])box([.013,.116,.012],[Math.sin(angle)*.064,-Math.cos(angle)*.064,-.002],leather,.003,[0,0,angle],wheelBatch);
 merge(wheelBatch,steeringWheel);
 // Low rear cushion and parcel shelf, kept under the rear window rather than a black void.
 box([1.20,.10,.30],[0,.36,-.96],leather,.038);
 box([1.28,.19,.10],[0,.49,-1.12],leather,.04,[-.10,0,0]);
 box([1.32,.07,.16],[0,.62,-1.10],carpet,.018);
 merge(batches,root);
 let disposed=false,templateAccepted=false,seatGeometry=[];
 function setSeatTemplate(template){
  if(disposed)return;
  seatGroup.clear();for(const g of seatGeometry){g.dispose();ownedGeometry.delete(g);}seatGeometry=[];templateAccepted=false;
  if(template&&!simple){
   let tris=0,calls=0;template.traverse(o=>{if(o.isMesh){tris+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;calls+=Array.isArray(o.material)?o.material.length:1;}});
   // A malformed/heavy source must not silently blow the exterior cabin budget.
   if(tris<=12000&&calls<=5){
    template.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(template),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    if(size.x>0&&size.y>0&&size.z>0){const scale=Math.min(.49/size.x,.56/size.z,.74/size.y);
     for(const x of[-.35,.35]){const pivot=new THREE.Group(),seat=template.clone(true);pivot.position.set(x,.31,-.40);pivot.scale.setScalar(scale);seat.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));seat.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=true;}});pivot.add(seat);seatGroup.add(pivot);}
     templateAccepted=true;
    }
   }
  }
  if(!templateAccepted){const fallback=new Map();
   for(const x of[-.35,.35]){
    box([.43,.095,.47],[x,.358,-.35],leather,.045,[0,0,0],fallback);
    box([.41,.47,.105],[x,.642,-.55],leather,.055,[-.10,0,0],fallback);
    box([.22,.15,.10],[x,.958,-.565],leather,.04,[-.06,0,0],fallback);
    if(!simple)for(const side of[-1,1]){box([.063,.105,.42],[x+side*.19,.392,-.35],leather,.028,[0,0,0],fallback);box([.067,.35,.115],[x+side*.174,.652,-.507],leather,.028,[-.10,0,side*-.10],fallback);}
   }
   const before=new Set(ownedGeometry);merge(fallback,seatGroup);seatGeometry=[...ownedGeometry].filter(g=>!before.has(g));
  }
  root.userData.cabinInterior=stats();
 }
 function stats(){let triangles=0,drawCalls=0;root.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;drawCalls+=Array.isArray(o.material)?o.material.length:1;}});return {triangles,drawCalls,templateAccepted,simple};}
 setSeatTemplate(seatTemplate);
 return {root,setSeatTemplate,update(p){steeringWheel.rotation.z=-(p.steer||0)*5;},setInterior(inside){root.visible=!inside;},stats,dispose(){if(disposed)return;disposed=true;root.clear();for(const g of ownedGeometry)g.dispose();for(const m of ownedMaterials)m.dispose();ownedGeometry.clear();ownedMaterials.clear();}};
}
