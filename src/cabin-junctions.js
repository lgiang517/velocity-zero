import * as THREE from 'three';
import {sampleAssemblyChain} from './vehicle-assembly.js';

// +Z is forward. The inner door wall is x=±.819; dash + end cap stop at ±.814.
export const DASH_HALF_WIDTH=.804;
export const DASH_END_CAP_WIDTH=.010;
export const DOOR_FRONT_SEAM=.62;
const FRONT_Z=1.20;
const profile=new THREE.CatmullRomCurve3([[FRONT_Z,.805],[1.045,.834],[.83,.822],[.635,.766],[.601,.686],[.676,.582],[.94,.567],[FRONT_Z,.66]].map(([z,y])=>new THREE.Vector3(0,y,z)),true,'catmullrom',.28);
export function dashSectionPoint(x,t,assembly=null){
 const p=profile.getPoint(t),u=Math.abs(x)/DASH_HALF_WIDTH;
 const q=new THREE.Vector3(x,p.y+.013*(1-u*u),Math.min(FRONT_Z,p.z)+.055*u**3);
 if(assembly){const edge=assemblyDashEdge(assembly,x),oldZ=FRONT_Z+.055*u**3,progress=THREE.MathUtils.clamp((q.z-.67)/(oldZ-.67),0,1);q.y+=(edge.y-(.805+.013*(1-u*u)))*THREE.MathUtils.smoothstep(progress,0,1)*THREE.MathUtils.smoothstep(q.y,.67,.80);if(q.z>.67)q.z=THREE.MathUtils.lerp(.67,edge.z,progress);}
 return q;
}
export function dashFrontPoint(x,assembly=null){return dashSectionPoint(x,0,assembly);}
export function dashTopAt(x,z,assembly=null){
 let best=-Infinity;
 for(let i=0;i<192;i++){
  const a=dashSectionPoint(x,i/192,assembly),b=dashSectionPoint(x,(i+1)/192,assembly);
  if(z>=Math.min(a.z,b.z)-1e-9&&z<=Math.max(a.z,b.z)+1e-9){const t=Math.abs(b.z-a.z)<1e-8?0:(z-a.z)/(b.z-a.z);best=Math.max(best,THREE.MathUtils.lerp(a.y,b.y,t));}
 }
 return Number.isFinite(best)?best:dashFrontPoint(x,assembly).y;
}
function geometry(positions,uv,indices){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;}
export function createDashShellGeometry(assembly=null){
 const rows=24,cols=48,positions=[],uv=[],indices=[];
 for(let i=0;i<=rows;i++)for(let j=0;j<cols;j++){positions.push(...dashSectionPoint((i/rows-.5)*2*DASH_HALF_WIDTH,j/cols,assembly));uv.push(i/rows,j/cols);}
 for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const a=i*cols+j,b=i*cols+(j+1)%cols,c=a+cols,d=b+cols;indices.push(a,c,b,b,c,d);}
 for(const end of[0,rows]){const c=positions.length/3;positions.push((end/rows-.5)*2*DASH_HALF_WIDTH,.72,assembly ? .70 : .90);uv.push(.5,.5);for(let j=0;j<cols;j++){const a=end*cols+j,b=end*cols+(j+1)%cols;indices.push(...(end===0?[c,a,b]:[c,b,a]));}}
 const g=geometry(positions,uv,indices);g.userData.dashSections={rows,cols};return g;
}
export function createDashEndCapGeometry(side,assembly=null){
 const centerZ=assembly ? .70 : .90;
 const n=48,positions=[],uv=[],indices=[];
 for(let row=0;row<=3;row++)for(let j=0;j<n;j++){
  const p=dashSectionPoint(side*DASH_HALF_WIDTH,j/n,assembly),t=row/3;
  p.x+=side*DASH_END_CAP_WIDTH*t;p.y=.72+(p.y-.72)*(1-.055*t);p.z=centerZ+(p.z-centerZ)*(1-.016*t);positions.push(...p);uv.push(j/n,t);
 }
 for(let row=0;row<3;row++)for(let j=0;j<n;j++){const a=row*n+j,b=row*n+(j+1)%n,c=a+n,d=b+n;indices.push(...(side>0?[a,c,b,b,c,d]:[a,b,c,b,d,c]));}
 const center=positions.length/3;positions.push(side*(DASH_HALF_WIDTH+DASH_END_CAP_WIDTH),.72,centerZ);uv.push(.5,.5);
 for(let j=0;j<n;j++){const a=3*n+j,b=3*n+(j+1)%n;indices.push(...(side>0?[center,b,a]:[center,a,b]));}
 return geometry(positions,uv,indices);
}

// Begins on the actual dash front edge, travels only forward and closes below the bonnet.
// The rear return is the dash front cap, so no second coplanar fascia face is created.
export function createWindscreenLandingGeometry(surfaceAt=null){
 if(surfaceAt?.windscreenLower)return createAssemblyLandingGeometry(surfaceAt);
 const cols=24,rows=10,positions=[],uv=[],indices=[];
 const targets=Array.from({length:cols+1},(_,col)=>{const x=(col/cols-.5)*2*DASH_HALF_WIDTH;return surfaceAt?surfaceAt(x,1.42):.8945-.011*(Math.abs(x)/DASH_HALF_WIDTH)**2;});
 for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
  const x=(col/cols-.5)*2*DASH_HALF_WIDTH,a=dashFrontPoint(x),t=row/rows,s=t*t*(3-2*t);
  const z=THREE.MathUtils.lerp(a.z,1.42,t),target=targets[col];
  positions.push(x,THREE.MathUtils.lerp(a.y,target,s),z);uv.push(col/cols,t);
 }
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){const a=row*(cols+1)+col,b=a+1,c=a+cols+1,d=c+1;indices.push(a,c,b,b,c,d);}
 const returnEdge=(edge)=>{for(let i=0;i<edge.length-1;i++){
  const a=edge[i],b=edge[i+1],c=positions.length/3;positions.push(positions[a*3],.65,positions[a*3+2],positions[b*3],.65,positions[b*3+2]);uv.push(0,0,1,0);indices.push(a,b,c,b,c+1,c);
 }};
 returnEdge(Array.from({length:cols+1},(_,i)=>rows*(cols+1)+cols-i));
 returnEdge(Array.from({length:rows+1},(_,i)=>i*(cols+1)));
 returnEdge(Array.from({length:rows+1},(_,i)=>(rows-i)*(cols+1)+cols));
 return geometry(positions,uv,indices);
}

export function assemblyDashEdge(assembly,x){
 const p=sampleAssemblyChain(assembly.windscreenLower,x);p.y-=.026*assembly.scale[1];p.z-=.038*assembly.scale[2];return p;
}
function solidSurface(rings,thickness){
 const cols=rings[0].length,rows=rings.length,positions=[],uv=[],indices=[];
 for(const lower of[false,true])for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const p=rings[i][j];positions.push(p.x,p.y-(lower?thickness:0),p.z);uv.push(j/(cols-1),i/(rows-1));}
 const n=rows*cols;
 for(let i=0;i<rows-1;i++)for(let j=0;j<cols-1;j++){const a=i*cols+j,b=a+1,c=a+cols,d=c+1;indices.push(a,c,b,b,c,d,a+n,b+n,c+n,b+n,d+n,c+n);}
 const edge=[];for(let j=0;j<cols;j++)edge.push(j);for(let i=1;i<rows;i++)edge.push(i*cols+cols-1);for(let j=cols-2;j>=0;j--)edge.push((rows-1)*cols+j);for(let i=rows-2;i>0;i--)edge.push(i*cols);
 for(let i=0;i<edge.length;i++){const a=edge[i],b=edge[(i+1)%edge.length];indices.push(a,b,a+n,b,b+n,a+n);}
 return geometry(positions,uv,indices);
}
export function createAssemblyLandingGeometry(assembly){
 const rings=[];
 for(let row=0;row<=4;row++){const t=row/4,s=t*t*(3-2*t),ring=[];
  for(let col=0;col<=24;col++){const x=(col/12-1)*DASH_HALF_WIDTH,a=dashFrontPoint(x,assembly),b=sampleAssemblyChain(assembly.windscreenInnerLower,x),p=a.clone().lerp(b,s);p.z=THREE.MathUtils.lerp(a.z,b.z,t);ring.push(p);}
  rings.push(ring);
 }
 // This is the 38 mm interior reveal beneath the actual cowl back edge.
 return solidSurface(rings,.012);
}
export function createLegacyCowlGeometry(assembly){
 const rings=[];
 for(let row=0;row<=6;row++){const t=row/6,ring=[];
  for(let col=0;col<=32;col++){const i=col/32,a=new THREE.Vector3(...assembly.windscreenLower[col]),b=new THREE.Vector3(...assembly.hoodRear[col]);b.y-=.001;b.z+=.004;ring.push(a.clone().lerp(b,t));}
  rings.push(ring);
 }
 return solidSurface(rings,assembly.panelThickness.cowl*assembly.scale[1]);
}
/** A capped molding widens into a formed triangular foot on the common front quarter. */
export function createAPillarJunctionGeometry(assembly,side){
 const lower=new THREE.Vector3(...assembly.windscreenLower[side<0?0:assembly.windscreenLower.length-1]);
 const upper=new THREE.Vector3(...assembly.windscreenUpper[side<0?0:assembly.windscreenUpper.length-1]);
 const top=upper.clone().add(new THREE.Vector3(-side*.020,-.029,-.018)),foot=lower.clone().add(new THREE.Vector3(-side*.020,-.026,-.018));
 const middle=foot.clone().lerp(top,.55),curve=new THREE.CatmullRomCurve3([foot,middle,top],false,'catmullrom',.35),rings=[];
 const corner=assembly.fixedCorners[side<0?'left':'right'];
 const rear=Math.min(corner.doorFrontUpper[2]+.043,lower.z-.12),front=lower.z-.002,inner=Math.min(DASH_HALF_WIDTH-.014,Math.abs(lower.x)-.030),outer=Math.max(DASH_HALF_WIDTH+.020,Math.abs(lower.x)+.003);
 const rearInner=new THREE.Vector3(side*inner,corner.doorFrontUpper[1]-.002,rear),rearOuter=new THREE.Vector3(side*outer,corner.doorFrontUpper[1]-.006,rear);
 const frontOuter=new THREE.Vector3(side*outer,lower.y-assembly.panelThickness.cowl,front),frontInner=new THREE.Vector3(side*inner,sampleAssemblyChain(assembly.windscreenInnerLower,side*inner).y-.007,front);
 const corners=[rearInner,rearOuter,frontOuter,frontInner],base=[];
 for(let i=0;i<4;i++){base.push(corners[i]);base.push(corners[i].clone().lerp(corners[(i+1)%4],.5));}
 for(let i=0;i<=32;i++){const t=i/32,p=curve.getPoint(t),tangent=curve.getTangent(t),lateral=new THREE.Vector3(side,0,0).addScaledVector(tangent,-side*tangent.x).normalize(),depth=new THREE.Vector3().crossVectors(tangent,lateral).normalize(),ring=[];
  for(let j=0;j<8;j++){const a=side*(.375-j/8)*Math.PI*2,q=p.clone().addScaledVector(lateral,Math.cos(a)*.025).addScaledVector(depth,Math.sin(a)*.010);if(t<.12)q.lerp(base[j].clone().addScaledVector(tangent,t*.05),1-THREE.MathUtils.smoothstep(t,0,.12));ring.push(q);}
  rings.push(ring);
 }
 const positions=[],uv=[],indices=[];for(let i=0;i<rings.length;i++)for(let j=0;j<8;j++){positions.push(...rings[i][j]);uv.push(j/8,i/32);}
 for(let i=0;i<32;i++)for(let j=0;j<8;j++){const a=i*8+j,b=i*8+(j+1)%8,c=a+8,d=b+8;indices.push(a,b,c,b,d,c);}
 for(const end of[0,32]){const center=rings[end].reduce((sum,p)=>sum.add(p),new THREE.Vector3()).divideScalar(8),c=positions.length/3;positions.push(...center);uv.push(.5,.5);for(let j=0;j<8;j++){const a=end*8+j,b=end*8+(j+1)%8;indices.push(...(end===0?[c,b,a]:[c,a,b]));}}
 // Signed volume gives consistent outward winding for mirrored closed parts.
 let volume=0;for(let i=0;i<indices.length;i+=3){const a=new THREE.Vector3().fromArray(positions,indices[i]*3),b=new THREE.Vector3().fromArray(positions,indices[i+1]*3),c=new THREE.Vector3().fromArray(positions,indices[i+2]*3);volume+=a.dot(b.cross(c));}
 if(volume<0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
 const g=geometry(positions,uv,indices);g.userData.junction={closed:true,foot:foot.toArray(),top:top.toArray(),base:base.map(p=>p.toArray())};return g;
}
