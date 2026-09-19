import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {BARRIER} from './road-boundaries.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap=(s,length)=>((s%length)+length)%length;
const CELLS={left:0,right:1,'winding-left':2,'winding-right':3,'chevron-left':4,'chevron-right':5,slow:6,back:7};
export const CURVE_SIGN_BUDGET=Object.freeze({curvatureThreshold:.0062,sampleStep:4,warningLead:85,mergeGap:130,chunkMetres:240,atlasWidth:512,atlasHeight:256});

/** Recognise sustained bends rather than isolated spline-curvature spikes.
 * Nearby successive bends share one advance warning in each travel direction. */
export function detectSharpBends(track){
 const step=CURVE_SIGN_BUDGET.sampleStep,raw=[];let current=null;
 function finish(){if(current&&current.endS-current.startS>=18&&current.headingChange>.16)raw.push(current);current=null;}
 for(let s=0;s<track.length;s+=step){const q=track.sample(s),curvature=q.curvature||0,turn=Math.sign(curvature);
  if(Math.abs(curvature)>=CURVE_SIGN_BUDGET.curvatureThreshold){
   if(current&&turn!==current.turn)finish();
   if(!current)current={startS:s,endS:s+step,turn,peakCurvature:Math.abs(curvature),headingChange:0};
   current.endS=Math.min(track.length,s+step);current.peakCurvature=Math.max(current.peakCurvature,Math.abs(curvature));current.headingChange+=Math.abs(curvature)*step;
  }else finish();
 }finish();
 const groups=[];
 for(const bend of raw){const last=groups.at(-1);if(last&&bend.startS-last.endS<=CURVE_SIGN_BUDGET.mergeGap){last.endS=bend.endS;last.bends.push(bend);last.peakCurvature=Math.max(last.peakCurvature,bend.peakCurvature);}else groups.push({id:groups.length,startS:bend.startS,endS:bend.endS,bends:[bend],peakCurvature:bend.peakCurvature});}
 for(const group of groups)group.winding=group.bends.some(b=>b.turn!==group.bends[0].turn);
 return{bends:raw,groups};
}
const barrierAt=(track,s)=>track.roadProfile?.(s)?.barrierOffset??BARRIER.offset;
export function planCurveSigns(track){
 const {bends,groups}=detectSharpBends(track),warnings=[],chevrons=[];
 for(const group of groups)for(const travel of[1,-1]){
  const s=wrap(travel>0?group.startS-CURVE_SIGN_BUDGET.warningLead:group.endS+CURVE_SIGN_BUDGET.warningLead,track.length),bend=travel>0?group.bends[0]:group.bends.at(-1),turn=bend.turn*travel;
  warnings.push({kind:'warning',groupId:group.id,s,travel,turn,icon:(group.winding?'winding-':'')+(turn>0?'right':'left'),lateral:travel*(barrierAt(track,s)+1.30),barrierOffset:barrierAt(track,s),leadMetres:CURVE_SIGN_BUDGET.warningLead,bottomHeight:2.05,topHeight:3.54});
 }
 for(const [bendIndex,bend]of bends.entries()){
  const length=bend.endS-bend.startS,spacing=clamp(16+1/bend.peakCurvature*.06,18,26),n=Math.max(2,Math.ceil(length/spacing));
  for(let i=0;i<n;i++){
   const s=bend.startS+Math.min(length-2,(i+.35)*length/n),outsideSide=-bend.turn;
   for(const travel of[1,-1]){const turn=bend.turn*travel;chevrons.push({kind:'chevron',bendIndex,s,travel,turn,icon:turn>0?'chevron-right':'chevron-left',outsideSide,lateral:outsideSide*(barrierAt(track,s)+1.0),barrierOffset:barrierAt(track,s),bottomHeight:1.82,topHeight:2.54});}
  }
 }
 return{bends,groups,warnings,chevrons};
}
function createAtlas(){
 if(typeof document==='undefined')return null;
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');if(!ctx)return null;
 function triangle(x,y){ctx.beginPath();ctx.moveTo(x+64,y+5);ctx.lineTo(x+123,y+121);ctx.lineTo(x+5,y+121);ctx.closePath();ctx.fillStyle='#171a17';ctx.fill();ctx.beginPath();ctx.moveTo(x+64,y+17);ctx.lineTo(x+111,y+114);ctx.lineTo(x+17,y+114);ctx.closePath();ctx.fillStyle='#efc94a';ctx.fill();}
 for(let cell=0;cell<8;cell++){
  const x=cell%4*128,y=Math.floor(cell/4)*128;
  if(cell<4){triangle(x,y);ctx.save();ctx.translate(x+64,y+77);if(cell%2===0)ctx.scale(-1,1);ctx.strokeStyle='#141713';ctx.fillStyle='#141713';ctx.lineWidth=8;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
   if(cell<2){ctx.moveTo(-12,27);ctx.lineTo(-12,7);ctx.quadraticCurveTo(-12,-9,5,-9);ctx.lineTo(20,-9);}else{ctx.moveTo(-8,28);ctx.bezierCurveTo(-8,14,15,18,15,5);ctx.bezierCurveTo(15,-6,-13,-2,-13,-14);ctx.quadraticCurveTo(-13,-23,7,-23);ctx.lineTo(18,-23);}ctx.stroke();
   const yy=cell<2?-9:-23;ctx.beginPath();ctx.moveTo(29,yy);ctx.lineTo(13,yy-11);ctx.lineTo(13,yy+11);ctx.closePath();ctx.fill();ctx.restore();
  }else if(cell<6){ctx.fillStyle='#1b201b';ctx.fillRect(x,y,128,128);ctx.fillStyle='#edc645';ctx.fillRect(x+5,y+5,118,118);ctx.save();ctx.translate(x+64,y+64);if(cell===4)ctx.scale(-1,1);ctx.fillStyle='#181d17';ctx.beginPath();ctx.moveTo(-34,-51);ctx.lineTo(-5,-51);ctx.lineTo(42,0);ctx.lineTo(-5,51);ctx.lineTo(-34,51);ctx.lineTo(13,0);ctx.closePath();ctx.fill();ctx.restore();
  }else if(cell===6){ctx.fillStyle='#1c211c';ctx.fillRect(x,y,128,128);ctx.fillStyle='#edce6b';ctx.fillRect(x+3,y+6,122,116);ctx.fillStyle='#1b211b';ctx.font='bold 27px sans-serif';ctx.textAlign='center';ctx.fillText('减速慢行',x+64,y+73);
  }else{ctx.fillStyle='#788079';ctx.fillRect(x,y,128,128);}
 }
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}
/** Replaces the old same-arrow chevron pool in world.buildSigns. No lights or
 * per-frame updates. Every sign direction has its own front face and artwork. */
export function buildCurveSigns(world){
 const plan=planCurveSigns(world.track),texture=createAtlas(),meshes=[],items=[],chunks=new Map(),track=world.track;
 const boardMaterial=new THREE.MeshStandardMaterial({map:texture,emissiveMap:texture,emissive:'#c7cabb',emissiveIntensity:.19,color:0xffffff,roughness:.64,metalness:.04,alphaTest:.4});
  const stats={bends:plan.bends.length,warningGroups:plan.groups.length,warningFaces:plan.warnings.length,chevronFaces:plan.chevrons.length,chevronPosts:plan.chevrons.length/2,triangles:0,batches:0,atlasTextures:texture?1:0,newLights:0,perFrameUpdates:0};
 const box=new THREE.BoxGeometry(1,1,1),postKeys=new Set();
 function addChunk(geometry,s,type){const key=String(Math.floor(s/CURVE_SIGN_BUDGET.chunkMetres));if(!chunks.has(key))chunks.set(key,{type,geometries:[]});chunks.get(key).geometries.push(geometry);}
 function face(item,cell,width,height,centreHeight,{triangle=false,back=false}={}){
  const q=track.sample(item.s),travel=back?-item.travel:item.travel,normal=q.tan.clone();normal.y=0;normal.normalize().multiplyScalar(-travel);
  const p=track.point(item.s,item.lateral,centreHeight).addScaledVector(normal,.036),yaw=q.heading+(travel>0?Math.PI:0);
  let geometry;if(triangle){geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-width/2,-height/2,0,width/2,-height/2,0,0,height/2,0],3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,.5,1],2));geometry.setIndex([0,1,2]);geometry.computeVertexNormals();}else geometry=new THREE.PlaneGeometry(width,height);
  const uv=geometry.attributes.uv,column=cell%4,row=Math.floor(cell/4);for(let i=0;i<uv.count;i++)uv.setXY(i,(column+uv.getX(i))/4,(1-row+uv.getY(i))/2);
  geometry.rotateY(yaw);geometry.translate(...p.toArray());addChunk(geometry,item.s,'board');
  if(!back)items.push({...item,kind:cell===CELLS.slow?'advisory':item.kind,position:p.toArray(),faceNormal:normal.toArray(),width,height,bottomY:p.y-height/2,topY:p.y+height/2});
 }
 function post(item,top){const key=item.kind+':'+item.s.toFixed(3)+':'+item.lateral.toFixed(2);if(postKeys.has(key))return;postKeys.add(key);
  const q=track.sample(item.s),p=track.point(item.s,item.lateral),baseY=q.p.y-.35,height=top+.35;p.y=baseY+height/2;const g=box.clone(),uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(3+uv.getX(i))/4,uv.getY(i)/2);g.scale(.095,height,.095);g.rotateY(q.heading);g.translate(...p.toArray());addChunk(g,item.s,'post');items.push({kind:'post',s:item.s,lateral:item.lateral,barrierOffset:item.barrierOffset,baseY,topY:baseY+height,position:p.toArray()});
 }
 for(const item of plan.warnings){face(item,CELLS[item.icon],1.64,1.49,2.795,{triangle:true});face(item,CELLS.back,1.64,1.49,2.795,{triangle:true,back:true});face(item,CELLS.slow,1.48,.34,1.93);face(item,CELLS.back,1.48,.34,1.93,{back:true});post(item,3.24);}
 for(const item of plan.chevrons){face(item,CELLS[item.icon],1.12,.72,2.18);post(item,2.33);}
 box.dispose();
 for(const[key,batch]of chunks){const geometry=mergeGeometries(batch.geometries);batch.geometries.forEach(g=>g.dispose());geometry.computeBoundingBox();geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,boardMaterial);mesh.name='Curve guidance '+key;mesh.castShadow=false;mesh.receiveShadow=false;mesh.userData.curveSigns=true;world.scene.add(mesh);meshes.push(mesh);stats.triangles+=(geometry.index?.count??geometry.attributes.position.count)/3;stats.batches++;}
 return{stats,items,plan,meshes,dispose(){for(const mesh of meshes){world.scene.remove(mesh);mesh.geometry.dispose();}boardMaterial.dispose();texture?.dispose();}};
}
