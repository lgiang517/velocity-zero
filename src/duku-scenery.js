import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {chinaMountainMaterial} from './china-mountain-material.js';
import {createDukuLandforms} from './duku-landforms.js';
export {createDukuLandforms} from './duku-landforms.js';
export const DUKU_SECTION={id:'duku',label:'独库公路 · 哈希勒根—乔尔玛',reconstruction:'compressed-real-features'};
export const DUKU_REFERENCES=[
 'https://jtyst.xinjiang.gov.cn/xjjtysj/mtkjt/202308/9b500b80572346f7ac346298ad6afb23.shtml',
 'https://jtyst.xinjiang.gov.cn/xjjtysj/mtkjt/201905/76bb697b614c40a1856ad0565b41facb.shtml'
];
const UP=new THREE.Vector3(0,1,0),clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
/** G217 northern-section features follow the complete new route: open avalanche
 * gallery, snow cuts at the pass, exposed rock ledges and four real hairpins.
 * Geometry is compressed to game scale; no claim of a surveyed digital twin. */
export function buildDukuScenery(world){
 const landforms=createDukuLandforms(world.track),meshes=[],materials=[],textures=[],sourceItems=[];
 const stats={enabled:!!landforms,triangles:0,batches:0,markers:0,snowVertices:0,snowWallMetres:0,galleryMetres:0,newAssetDownloads:0,perFrameUpdates:0};
 if(!landforms)return{stats,meshes,sourceItems,dispose(){}};
 const {section,features}=landforms,track=world.track;stats.section={id:'duku',startS:section.startS,endS:section.endS,length:section.length};
 const mountainMaterial=chinaMountainMaterial(world),detailMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.93,metalness:0,envMapIntensity:.1});materials.push(detailMaterial);
 function add(geometry,material,name,metadata={}){
  geometry.computeBoundingBox();geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.castShadow=false;mesh.receiveShadow=false;mesh.userData.dukuScenery=true;mesh.userData.source=metadata;meshes.push(mesh);world.scene.add(mesh);stats.triangles+=(geometry.index?.count??geometry.attributes.position.count)/3;stats.batches++;return mesh;
 }
 function grid(name,cols,rows,point,color,metadata={},tileCols=cols,tileRows=rows,material=mountainMaterial){
  const pp=[],idx=[];for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++)pp.push(...point(i/cols,j/rows));
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const a=j*(cols+1)+i,b=a+cols+1;idx.push(a,b,a+1,a+1,b,b+1);}
  const source=new THREE.BufferGeometry();source.setAttribute('position',new THREE.Float32BufferAttribute(pp,3));source.setIndex(idx);source.computeVertexNormals();
  const p=source.attributes.position,n=source.attributes.normal,cc=[],dd=[];for(let i=0;i<p.count;i++){const c=color(p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i));cc.push(...c.slice(0,3));dd.push(c[4]??0,c[3]??0,c[5]??1);if(c[3]>.6)stats.snowVertices++;}
  for(let z0=0;z0<rows;z0+=tileRows)for(let x0=0;x0<cols;x0+=tileCols){const width=Math.min(tileCols,cols-x0),height=Math.min(tileRows,rows-z0),pos=[],normals=[],colors=[],data=[],indices=[];
   for(let j=0;j<=height;j++)for(let i=0;i<=width;i++){const a=(j+z0)*(cols+1)+i+x0;pos.push(p.getX(a),p.getY(a),p.getZ(a));normals.push(n.getX(a),n.getY(a),n.getZ(a));colors.push(cc[a*3],cc[a*3+1],cc[a*3+2]);data.push(dd[a*3],dd[a*3+1],dd[a*3+2]);}
   for(let j=0;j<height;j++)for(let i=0;i<width;i++){const a=j*(width+1)+i,b=a+width+1;indices.push(a,b,a+1,a+1,b,b+1);}
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('mountainData',new THREE.Float32BufferAttribute(data,3));geometry.setIndex(indices);add(geometry,material,name+' '+x0+':'+z0,metadata);
  }source.dispose();
 }
 const [minX,minZ,maxX,maxZ]=landforms.bounds;
 grid('Duku northern Tianshan bedrock',140,95,(u,v)=>{const x=mix(minX,maxX,u),z=mix(minZ,maxZ,v);return[x,landforms.heightAt(x,z,world.chinaTerrain?.surfaceHeight(x,z)??world.groundHeight(x,z)),z];},landforms.colorAt,{kind:'landform',bounds:landforms.bounds},35,24);
 // Open avalanche gallery: the mountain side is solid, the valley side is
 // visibly open between piers. Sloped roof discharges snow past the open side.
 const gallery=features.gallery,wallSide=-1,openSide=1;
 const box=new THREE.BoxGeometry(1,1,1),chunks=new Map();
 function boxAt(p,size,color,heading,metadata,quaternion=null){
  const g=box.toNonIndexed();g.deleteAttribute('uv');g.applyMatrix4(new THREE.Matrix4().compose(p,quaternion??new THREE.Quaternion().setFromAxisAngle(UP,heading),new THREE.Vector3(...size)));
  const col=new THREE.Color(color),colors=[];for(let i=0;i<g.attributes.position.count;i++)colors.push(col.r,col.g,col.b);g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const key=Math.floor(p.x/180)+':'+Math.floor(p.z/180);if(!chunks.has(key))chunks.set(key,[]);chunks.get(key).push(g);sourceItems.push({...metadata,position:p.toArray(),size,heading});
 }
 function beam(a,b,width,depth,color,metadata){const delta=b.clone().sub(a);boxAt(a.clone().add(b).multiplyScalar(.5),[width,delta.length(),depth],color,0,metadata,new THREE.Quaternion().setFromUnitVectors(UP,delta.normalize()));}
 function roofStrip(){const positions=[],indices=[],colors=[],n=Math.ceil(gallery.length/4),cross=[[-13,7.65],[13,6.85],[13,7.48],[-13,8.28]];
  for(let i=0;i<=n;i++){const s=mix(gallery.startS,gallery.endS,i/n);for(const [d,h]of cross){const p=track.point(s,d,h);positions.push(...p.toArray());const c=new THREE.Color(h<7.4?'#656c68':'#a4a69b');colors.push(c.r,c.g,c.b);}}
  for(let i=0;i<n;i++)for(let j=0;j<4;j++){const a=i*4+j,b=i*4+(j+1)%4,c=(i+1)*4+j,d=(i+1)*4+(j+1)%4;indices.push(a,b,c,b,d,c);}
  indices.push(0,3,1,1,3,2,n*4,n*4+1,n*4+3,n*4+1,n*4+2,n*4+3);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();add(geometry,detailMaterial,'Duku 314m avalanche gallery roof',{kind:'gallery-roof',startS:gallery.startS,endS:gallery.endS,minClearance:6.85});
 }
 roofStrip();
 for(let s=gallery.startS;s<=gallery.endS;s+=8){const q=track.sample(s),p=track.point(s,openSide*12.1),base=q.p.y-.45;
  boxAt(new THREE.Vector3(p.x,base+3.63,p.z),[1.05,7.26,.85],'#aaa99d',q.heading,{kind:'gallery-open-pier',s,lateral:openSide*12.1,baseY:base});
  boxAt(new THREE.Vector3(p.x,q.p.y-.10,p.z),[1.45,.75,1.35],'#909488',q.heading,{kind:'gallery-footing',s,lateral:openSide*12.1,baseY:q.p.y-.475});
  beam(track.point(s,-12.1,7.25),track.point(s,12.1,6.51),.62,.7,'#898f88',{kind:'gallery-crossbeam',s,minClearance:6.2});
 }
 for(let s=gallery.startS+1.5;s<gallery.endS;s+=3){const q=track.sample(s),p=track.point(s,wallSide*12.3);boxAt(new THREE.Vector3(p.x,q.p.y+3.65,p.z),[.9,8.15,3.13],'#9b9d91',q.heading,{kind:'gallery-mountain-wall',s,lateral:wallSide*12.3,baseY:q.p.y-.425});}
 stats.galleryMetres=gallery.length;
 // Rock rests behind the closed gallery wall and joins the existing high
 // shelf, rather than a concrete shed standing alone on flat green ground.
 grid('Duku gallery rock backfill',Math.ceil((gallery.length+36)/5),8,(u,v)=>{
  const s=gallery.startS-18+(gallery.length+36)*u,lateral=-mix(58,13.1,v),p=track.point(s,lateral),q=track.sample(s),edge=smooth(0,.075,u)*(1-smooth(.925,1,u));
  const base=world.groundHeight(p.x,p.z),target=q.p.y+mix(23,7.6,v)+Math.sin(u*17)*1.7*(1-v);
  return[p.x,mix(base-.25,Math.max(base,target),edge),p.z];
 },(x,y,z,nx,ny,nz)=>landforms.colorAt(x,y,z,nx,ny,nz),{kind:'gallery-backfill',startS:gallery.startS-18,endS:gallery.endS+18},Math.ceil((gallery.length+36)/5),8);
 // Snow walls show ploughed vertical inner faces, dusty lower bands and a
 // rounded broken crest. Ends taper to the ground instead of open mesh cuts.
 for(const wall of features.snowWalls)for(const side of wall.sides){
  const n=Math.ceil((wall.endS-wall.startS)/4),points=[],indices=[],colors=[],profile=[[12.85,0],[12.85,.10],[12.94,.60],[13.55,1],[16.2,.88],[21.8,0]];
  for(let i=0;i<=n;i++){const s=mix(wall.startS,wall.endS,i/n),q=track.sample(s),endFade=smooth(0,.10,i/n)*(1-smooth(.90,1,i/n)),height=(4.6+.55*Math.sin(i*.51)+.30*Math.sin(i*1.21))*endFade;
   for(const [lateral,h]of profile){const p=track.point(s,side*lateral),base=lateral>20?world.groundHeight(p.x,p.z)-.3:q.p.y-.35;p.y=base+height*h;
    points.push(...p.toArray());const c=new THREE.Color(h<.12?'#bcc1b5':h<.7?'#dbe5e3':'#eef1eb');colors.push(c.r,c.g,c.b);}
  }
  for(let i=0;i<n;i++)for(let j=0;j<profile.length-1;j++){const a=i*profile.length+j,b=a+profile.length;side>0?indices.push(a,b,a+1,a+1,b,b+1):indices.push(a,a+1,b,a+1,b+1,b);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();add(geometry,detailMaterial,'Duku ploughed pass snow wall '+side,{kind:'snow-wall',side,startS:wall.startS,endS:wall.endS,innerClearance:12.85,grounded:true});stats.snowWallMetres+=wall.endS-wall.startS;
 }
 // Tall red/white snow guides and G217 stones provide recognition at driving
 // height without relying on a large theme sign to explain the landscape.
 const inGallery=s=>s>=gallery.startS-8&&s<=gallery.endS+8;
 const inSnow=s=>features.snowWalls.some(w=>s>=w.startS-5&&s<=w.endS+5);
 for(let s=section.startS+25;s<section.endS-20;s+=38){if(inGallery(s)||inSnow(s))continue;const q=track.sample(s);for(const side of[-1,1]){
  const p=track.point(s,side*12.25);for(let band=0;band<4;band++)boxAt(new THREE.Vector3(p.x,q.p.y-.22+.27+band*.51,p.z),[.13,.51,.13],band%2?'#c15749':'#e4e2d6',q.heading,{kind:'snow-guide',s,lateral:side*12.25,baseY:q.p.y-.22});stats.markers++;
 }}
 const labels=[];
 for(const [i,progress]of [.04,.68,.94].entries()){
  const s=track.sectionS('duku',progress),q=track.sample(s),p=track.point(s,13.8);p.y=q.p.y-.2;
  boxAt(p.clone().add(new THREE.Vector3(0,.72,0)),[.70,1.5,.32],'#deded0',q.heading,{kind:'G217-milestone',s,lateral:13.8,baseY:p.y-.03});boxAt(p.clone().add(new THREE.Vector3(0,1.40,0)),[.71,.23,.33],'#ba5144',q.heading,{kind:'G217-milestone-cap',s,lateral:13.8});labels.push({p,q,index:i});
 }
 for(const [key,geometries]of chunks){add(mergeGeometries(geometries),detailMaterial,'Duku static roadside detail '+key,{kind:'details'});geometries.forEach(g=>g.dispose());}box.dispose();
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=128;const ctx=canvas.getContext('2d');if(ctx){
   const geometries=[];ctx.fillStyle='#deded0';ctx.fillRect(0,0,384,128);ctx.fillStyle='#38413b';ctx.textAlign='center';
   for(const {p,q,index}of labels){ctx.font='bold 29px sans-serif';ctx.fillText('G217',index*128+64,35);ctx.font='bold 35px sans-serif';ctx.fillText(String(650+index*10),index*128+64,79);ctx.font='16px sans-serif';ctx.fillText('独库公路',index*128+64,111);const geometry=new THREE.PlaneGeometry(.65,1.12),uv=geometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setX(i,(uv.getX(i)+index)/3);const position=p.clone().add(new THREE.Vector3(0,.70,0)).addScaledVector(q.tan,-.172);geometry.rotateY(q.heading+Math.PI);geometry.translate(...position.toArray());geometries.push(geometry);}
   const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;textures.push(texture);const material=new THREE.MeshStandardMaterial({map:texture,roughness:.96});materials.push(material);add(mergeGeometries(geometries),material,'Duku G217 milestone lettering',{kind:'lettering'});geometries.forEach(g=>g.dispose());
  }
 }
 const maxHeight=Math.max(...meshes.filter(m=>m.userData.source.kind==='landform').map(m=>m.geometry.boundingBox.max.y));stats.maxMountainHeight=maxHeight;stats.features=features.referenceFeatures;
 return{stats,meshes,sourceItems,section,features,views:landforms.views,landforms,references:DUKU_REFERENCES,dispose(){for(const mesh of meshes){world.scene.remove(mesh);mesh.geometry.dispose();}materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
