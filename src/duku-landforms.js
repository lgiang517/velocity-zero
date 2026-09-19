import * as THREE from 'three';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
const hash=(x,z)=>{const v=Math.sin(x*127.1+z*311.7)*43758.5453;return v-Math.floor(v);};
function noise(x,z){const ix=Math.floor(x),iz=Math.floor(z),a=smooth(0,1,x-ix),b=smooth(0,1,z-iz);return mix(mix(hash(ix,iz),hash(ix+1,iz),a),mix(hash(ix,iz+1),hash(ix+1,iz+1),a),b);}
function routeIndex(track){
 const cells=new Map(),segments=[],size=160;let minimumRoadY=Infinity;
 for(let s=0;s<track.length;s+=12){const end=Math.min(track.length,s+12),a=track.sample(s),b=track.sample(end),segment={a,b,s,end};segments.push(segment);minimumRoadY=Math.min(minimumRoadY,a.p.y,b.p.y);
  for(let iz=Math.floor(Math.min(a.p.z,b.p.z)/size);iz<=Math.floor(Math.max(a.p.z,b.p.z)/size);iz++)for(let ix=Math.floor(Math.min(a.p.x,b.p.x)/size);ix<=Math.floor(Math.max(a.p.x,b.p.x)/size);ix++){const key=ix+':'+iz;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(segment);}
 }
 return(x,z,withEnvelope=false)=>{
  const cx=Math.floor(x/size),cz=Math.floor(z/size),seen=new Set(),bankSlope=1.03+noise((x+z*.12)/81,z/115)*.42;let best=null,distance=Infinity,envelope=Infinity;
  const inspect=q=>{if(seen.has(q))return;seen.add(q);const dx=q.b.p.x-q.a.p.x,dz=q.b.p.z-q.a.p.z,t=clamp(((x-q.a.p.x)*dx+(z-q.a.p.z)*dz)/(dx*dx+dz*dz)),px=mix(q.a.p.x,q.b.p.x,t),pz=mix(q.a.p.z,q.b.p.z,t),d=Math.hypot(x-px,z-pz),y=mix(q.a.p.y,q.b.p.y,t);if(d<distance){distance=d;best={distance:d,s:mix(q.s,q.end,t),x:px,y,z:pz};}if(withEnvelope)envelope=Math.min(envelope,y-2+Math.max(0,d-18)*bankSlope);};
  for(let r=0;r<=10;r++){
   for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){if(r&&Math.abs(dx)!==r&&Math.abs(dz)!==r)continue;for(const q of cells.get((cx+dx)+':'+(cz+dz))||[])inspect(q);}
   const outside=Math.min(x-(cx-r)*size,(cx+r+1)*size-x,z-(cz-r)*size,(cz+r+1)*size-z);
   if(distance<=outside&&(!withEnvelope||minimumRoadY-2+Math.max(0,outside-18)*bankSlope>=envelope))break;
   if(r===10)for(const q of segments)inspect(q);
  }
  best.envelope=envelope;return best;
 };
}
function edgeHeight(x,z,a,b,width){
 const dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz),t=clamp(((x-a[0])*dx+(z-a[2])*dz)/(length*length));
 const bend=Math.sin(t*Math.PI)*(19+13*noise(a[0]/91,b[2]/77));
 const px=mix(a[0],b[0],t)-dz/length*bend,pz=mix(a[2],b[2],t)+dx/length*bend;
 const across=Math.hypot(x-px,z-pz),signed=((x-px)*-dz+(z-pz)*dx)/length;
 const height=mix(a[1],b[1],t)+Math.sin(t*Math.PI)*15;
 const sideWidth=width*(signed>0?.79:1.12);
 // Rounded glacial shoulders end in exposed arêtes; nested, directionally
 // coherent channels cut across slopes instead of uniform surface noise.
 const shoulder=sideWidth*(across*.59+Math.pow(across/110,1.44)*39);
 const channel=noise((x-z*.30+noise(x/260,z/310)*37)/74,z/170);
 const gully=Math.pow(1-Math.abs(channel*2-1),5)*33*smooth(8,70,across);
 const ribs=(noise((x+z*.26)/138,z/235)-.5)*17;
 return height-shoulder+ribs-gully;
}
const C={meadow:new THREE.Color('#74816c'),rock:new THREE.Color('#918d81'),dark:new THREE.Color('#626a6c'),snow:new THREE.Color('#e5e9e7')};
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
  if(x<bounds[0]-1e-5||x>bounds[2]+1e-5||z<bounds[1]-1e-5||z>bounds[3]+1e-5)return baseHeight;
  const edge=Math.min(x-bounds[0],bounds[2]-x,z-bounds[1],bounds[3]-z),fade=smooth(0,85,edge),skirtDepth=1.5+4.5*(1-smooth(0,28,edge));
  const q=nearestRoad(x,z,true);if(q.distance<=18)return baseHeight-skirtDepth;
  let rock=-Infinity;for(const ridge of ridges)rock=Math.max(rock,edgeHeight(x,z,ridge.a,ridge.b,ridge.width));
  const north=smooth(-12,44,z-q.z),nearShelf=q.y-2+105*(1-Math.exp(-Math.max(0,q.distance-18)/105))*north;
  const uphill=rock>baseHeight+2?rock:baseHeight;
  // The nearest road caps height beside EVERY switchback. A remote summit
  // cannot make the lower shelf disappear inside the opposite mountain face.
  const rill=Math.pow(1-Math.abs(noise((x-z*.25)/34,z/120)*2-1),4)*Math.min(19,Math.max(0,q.distance-18)*.24);
  const desired=Math.max(baseHeight,Math.min(Math.max(uphill,nearShelf),q.envelope)-rill);
  return mix(baseHeight-skirtDepth,desired,fade*smooth(18,45,q.distance));
 }
 function colorAt(x,y,z,nx,ny,nz){
  const slope=1-clamp(ny),highAltitude=smooth(highY+60,highY+165,y),gully=noise((x-z*.30)/74,z/170),n=noise(x/180,z/155);
  const shade=clamp(.5+nz*.55-nx*.15),vegetation=(1-smooth(.1,.34,slope))*(1-smooth(highY+15,highY+120,y))*(.6+shade*.4);
  const c=C.rock.clone().lerp(C.dark,smooth(.48,.84,gully)*.36).lerp(C.meadow,vegetation);
  const hollow=1-Math.abs(gully*2-1);
  // Wind-scoured rock remains visible beside snow-filled lee-side hollows.
  const leePatch=noise((x+z*.12)/108,z/154),retention=smooth(.58,.96,hollow);
  const snow=highAltitude*smooth(.43,.70,leePatch*.63+retention*.14+shade*.15+highAltitude*.07-slope*.12)*(1-smooth(.42,.68,slope));
  c.multiplyScalar(.91+n*.13).lerp(C.snow,snow);return[c.r,c.g,c.b,snow,vegetation,.9+.1*hollow];
 }
 const view=(name,local,lateral=0,height=2.2,lookAhead=75)=>{const s=section.startS+local;return{name,s,eye:track.point(s,lateral,height).toArray(),aim:track.point(s+lookAhead,lateral,3.2).toArray(),fov:65};};
 const views=[view('duku-first-hairpin',490,-3),view('duku-gallery-entry',gallery.startS-section.startS-45,-3),view('duku-gallery-inside',gallery.startS-section.startS+125,-3),view('duku-snow-wall',snowStart-section.startS+28,-3),view('duku-valley-descent',section.length-330,-3)];
 return{section,bounds,features,views,heightAt,colorAt,nearestRoad,sampleAt:f=>track.sample(track.sectionS('duku',f))};
}
