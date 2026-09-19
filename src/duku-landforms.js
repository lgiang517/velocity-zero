import * as THREE from 'three';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
const hash=(x,z)=>{const v=Math.sin(x*127.1+z*311.7)*43758.5453;return v-Math.floor(v);};
function noise(x,z){const ix=Math.floor(x),iz=Math.floor(z),a=smooth(0,1,x-ix),b=smooth(0,1,z-iz);return mix(mix(hash(ix,iz),hash(ix+1,iz),a),mix(hash(ix,iz+1),hash(ix+1,iz+1),a),b);}
function routeIndex(track){
 const cells=new Map(),segments=[],size=160;
 for(let s=0;s<track.length;s+=12){const end=Math.min(track.length,s+12),a=track.sample(s),b=track.sample(end),segment={a,b,s,end};segments.push(segment);const key=Math.floor(a.p.x/size)+':'+Math.floor(a.p.z/size);if(!cells.has(key))cells.set(key,[]);cells.get(key).push(segment);}
 return(x,z)=>{const cx=Math.floor(x/size),cz=Math.floor(z/size);let candidates=[];for(let r=0;r<=3;r++){for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){if(r&&Math.abs(dx)!==r&&Math.abs(dz)!==r)continue;const v=cells.get((cx+dx)+':'+(cz+dz));if(v)candidates.push(...v);}if(r>=1&&candidates.length)break;}if(!candidates.length)candidates=segments;
  let best=null,distance=Infinity;for(const q of candidates){const dx=q.b.p.x-q.a.p.x,dz=q.b.p.z-q.a.p.z,t=clamp(((x-q.a.p.x)*dx+(z-q.a.p.z)*dz)/(dx*dx+dz*dz)),px=mix(q.a.p.x,q.b.p.x,t),pz=mix(q.a.p.z,q.b.p.z,t),d=Math.hypot(x-px,z-pz);if(d<distance){distance=d;best={distance:d,s:mix(q.s,q.end,t),x:px,y:mix(q.a.p.y,q.b.p.y,t),z:pz};}}return best;
 };
}
function edgeHeight(x,z,a,b,width){
 const dx=b[0]-a[0],dz=b[2]-a[2],t=clamp(((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz)),px=mix(a[0],b[0],t),pz=mix(a[2],b[2],t);
 const across=Math.hypot(x-px,z-pz),height=mix(a[1],b[1],t);
 // Unequal bedrock planes and wide erosion chutes create connected arêtes.
 const ribs=(noise((x+z*.23)/112,z/154)-.5)*24;
 const gully=Math.pow(noise((x-z*.19)/83,z/167),1.5)*42;
 return height-across*width+ribs-gully;
}
const C={meadow:new THREE.Color('#7c865b'),rock:new THREE.Color('#8f8a7e'),dark:new THREE.Color('#6d7375'),snow:new THREE.Color('#edf0ed')};
/** High-resolution local landforms derived from the actual metre-based route.
 * Root renders its lower valley base. buildDukuScenery renders this surface once;
 * do not also evaluate heightAt in the coarse root terrain mesh. */
export function createDukuLandforms(track){
 const section=track.section?.('duku');if(!section)return null;
 const qs=[];for(let s=section.startS;s<=section.endS;s+=16)qs.push({...track.sample(s),s});
 const minX=Math.min(...qs.map(q=>q.p.x)),maxX=Math.max(...qs.map(q=>q.p.x)),minZ=Math.min(...qs.map(q=>q.p.z)),maxZ=Math.max(...qs.map(q=>q.p.z));
 const high=qs.reduce((a,b)=>a.p.y>b.p.y?a:b),highY=high.p.y,span=maxX-minX;
 const bounds=[minX-230,minZ-130,maxX+250,maxZ+590];
 const nodes=[
  [minX-115,highY+120,maxZ+75],[minX+span*.17,highY+250,maxZ+290],
  [minX+span*.34,highY+170,maxZ+230],[minX+span*.51,highY+295,maxZ+350],
  [minX+span*.65,highY+215,maxZ+245],[minX+span*.81,highY+265,maxZ+275],
  [maxX+165,highY+85,maxZ+90]
 ];
 const ridges=nodes.slice(1).map((node,i)=>({a:nodes[i],b:node,width:.73+(i%2)*.19}));
 for(const i of[1,3,5])ridges.push({a:nodes[i],b:[nodes[i][0]-100,highY+38,maxZ+28+(i%2)*18],width:.85});
 const nearestRoad=routeIndex(track);
 const highLine=track.parts?.find(p=>p.id==='duku-high-ascent'),galleryStart=(highLine?.startS??section.startS+section.length*.37)+60;
 const gallery={startS:galleryStart,endS:galleryStart+314,length:314,roofClearance:6.2,openSide:1};
 const snowStart=(highLine?.endS??high.s)-86,snowEnd=(highLine?.endS??high.s)+42;
 const features={gallery,snowWalls:[{startS:snowStart,endS:snowEnd,sides:[-1,1],maxHeight:5.8}],summits:nodes.filter((_,i)=>i===1||i===3||i===5),highPoint:{s:high.s,position:high.p.toArray()},bounds,referenceFeatures:['four-hairpins','rock-cut-and-gorge','snow-walls','314m-open-avalanche-gallery','snow-filled-gullies']};
 function heightAt(x,z,baseHeight){
  if(x<bounds[0]||x>bounds[2]||z<bounds[1]||z>bounds[3])return baseHeight;
  const q=nearestRoad(x,z);if(q.distance<=35)return baseHeight-.12;
  const edge=Math.min(x-bounds[0],bounds[2]-x,z-bounds[1],bounds[3]-z),fade=smooth(0,85,edge);
  let rock=-Infinity;for(const ridge of ridges)rock=Math.max(rock,edgeHeight(x,z,ridge.a,ridge.b,ridge.width));
  const north=smooth(-12,44,z-q.z),nearShelf=q.y-2+Math.min(48,Math.max(0,q.distance-35)*.86)*north;
  const uphill=rock>baseHeight+2?rock:baseHeight;
  // The nearest road caps height beside EVERY switchback. A remote summit
  // cannot make the lower shelf disappear inside the opposite mountain face.
  const roadEnvelope=q.y-1+Math.max(0,q.distance-35)*.94;
  const desired=Math.max(baseHeight,Math.min(Math.max(uphill,nearShelf),roadEnvelope));
  return mix(baseHeight-.16,desired,fade*smooth(35,78,q.distance));
 }
 function colorAt(x,y,z,nx,ny,nz){
  const q=nearestRoad(x,z),slope=1-clamp(ny),highAltitude=smooth(highY+62,highY+156,y),gully=noise((x-z*.18)/92,z/153),n=noise(x/157,z/139);
  const c=C.meadow.clone().lerp(C.rock,clamp(slope*1.7+smooth(highY-5,highY+90,y)*.75)).lerp(C.dark,smooth(.58,.92,n)*.24);
  // Snow runs down shaded hollows and remains broken by bare vertical ribs.
  const snow=highAltitude*(.58+.42*smooth(.10,.65,ny))*(.68+gully*.32);
  c.lerp(C.snow,snow);c.multiplyScalar(.93+n*.12);return[c.r,c.g,c.b,snow];
 }
 const view=(name,local,lateral=0,height=2.2,lookAhead=75)=>{const s=section.startS+local;return{name,s,eye:track.point(s,lateral,height).toArray(),aim:track.point(s+lookAhead,lateral,3.2).toArray(),fov:65};};
 const views=[view('duku-first-hairpin',490,-3),view('duku-gallery-entry',gallery.startS-section.startS-45,-3),view('duku-gallery-inside',gallery.startS-section.startS+125,-3),view('duku-snow-wall',snowStart-section.startS+28,-3),view('duku-valley-descent',section.length-330,-3)];
 return{section,bounds,features,views,heightAt,colorAt,nearestRoad,sampleAt:f=>track.sample(track.sectionS('duku',f))};
}
