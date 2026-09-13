import * as THREE from 'three';

// +Z is forward. The inner door wall is x=±.819; dash + end cap stop at ±.814.
export const DASH_HALF_WIDTH=.804;
export const DASH_END_CAP_WIDTH=.010;
export const DOOR_FRONT_SEAM=.62;
const FRONT_Z=1.20;
const profile=new THREE.CatmullRomCurve3([[FRONT_Z,.805],[1.045,.834],[.83,.822],[.635,.766],[.601,.686],[.676,.582],[.94,.567],[FRONT_Z,.66]].map(([z,y])=>new THREE.Vector3(0,y,z)),true,'catmullrom',.28);
export function dashSectionPoint(x,t){
 const p=profile.getPoint(t),u=Math.abs(x)/DASH_HALF_WIDTH;
 return new THREE.Vector3(x,p.y+.013*(1-u*u),Math.min(FRONT_Z,p.z)+.055*u**3);
}
export function dashFrontPoint(x){return dashSectionPoint(x,0);}
export function dashTopAt(x,z){
 let best=-Infinity;
 for(let i=0;i<192;i++){
  const a=dashSectionPoint(x,i/192),b=dashSectionPoint(x,(i+1)/192);
  if(z>=Math.min(a.z,b.z)-1e-9&&z<=Math.max(a.z,b.z)+1e-9){const t=Math.abs(b.z-a.z)<1e-8?0:(z-a.z)/(b.z-a.z);best=Math.max(best,THREE.MathUtils.lerp(a.y,b.y,t));}
 }
 return Number.isFinite(best)?best:dashFrontPoint(x).y;
}
function geometry(positions,uv,indices){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;}
export function createDashShellGeometry(){
 const rows=24,cols=48,positions=[],uv=[],indices=[];
 for(let i=0;i<=rows;i++)for(let j=0;j<cols;j++){positions.push(...dashSectionPoint((i/rows-.5)*2*DASH_HALF_WIDTH,j/cols));uv.push(i/rows,j/cols);}
 for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const a=i*cols+j,b=i*cols+(j+1)%cols,c=a+cols,d=b+cols;indices.push(a,c,b,b,c,d);}
 for(const end of[0,rows]){const c=positions.length/3;positions.push((end/rows-.5)*2*DASH_HALF_WIDTH,.72,.90);uv.push(.5,.5);for(let j=0;j<cols;j++){const a=end*cols+j,b=end*cols+(j+1)%cols;indices.push(...(end===0?[c,a,b]:[c,b,a]));}}
 return geometry(positions,uv,indices);
}
export function createDashEndCapGeometry(side){
 const n=48,positions=[],uv=[],indices=[];
 for(let row=0;row<=3;row++)for(let j=0;j<n;j++){
  const p=dashSectionPoint(side*DASH_HALF_WIDTH,j/n),t=row/3;
  p.x+=side*DASH_END_CAP_WIDTH*t;p.y=.72+(p.y-.72)*(1-.055*t);p.z=.90+(p.z-.90)*(1-.016*t);positions.push(...p);uv.push(j/n,t);
 }
 for(let row=0;row<3;row++)for(let j=0;j<n;j++){const a=row*n+j,b=row*n+(j+1)%n,c=a+n,d=b+n;indices.push(...(side>0?[a,c,b,b,c,d]:[a,b,c,b,d,c]));}
 const center=positions.length/3;positions.push(side*(DASH_HALF_WIDTH+DASH_END_CAP_WIDTH),.72,.90);uv.push(.5,.5);
 for(let j=0;j<n;j++){const a=3*n+j,b=3*n+(j+1)%n;indices.push(...(side>0?[center,b,a]:[center,a,b]));}
 return geometry(positions,uv,indices);
}

// Begins on the actual dash front edge, travels only forward and closes below the bonnet.
// The rear return is the dash front cap, so no second coplanar fascia face is created.
export function createWindscreenLandingGeometry(surfaceAt=null){
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
