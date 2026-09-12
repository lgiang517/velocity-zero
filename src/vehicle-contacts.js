/** Vehicle contacts in the local road (s,d) plane, SI units. */
const dot=(a,b)=>a.x*b.x+a.y*b.y;
const cross=(a,b)=>a.x*b.y-a.y*b.x;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const pose=p=>({s:p.s,d:p.d,yaw:p.yaw||0});
const unwrap=e=>e.p||e;
export function vehicleDimensions(p){return {length:4.663*(p.config?.id==='muscle'?1.06:p.config?.id==='light'?.95:1),width:2.272*(p.config?.id==='light'?.96:1)};}
export function captureVehiclePoses(entries){return new Map(entries.map(e=>{const p=unwrap(e);return [p,pose(p)];}));}
function body(e){const p=unwrap(e),{length,width}=vehicleDimensions(p),im=e.kinematic?0:1/(p.config?.mass||1540);return {p,length,width,im,ii:im?12*im/(length*length+width*width):0};}
function axes(p){const c=Math.cos(p.yaw||0),s=Math.sin(p.yaw||0);return [{x:c,y:s},{x:-s,y:c}];}
function radius(b,axis){const [f,r]=axes(b.p);return Math.abs(dot(f,axis))*b.length/2+Math.abs(dot(r,axis))*b.width/2;}
function contact(a,b){
  const delta={x:b.p.s-a.p.s,y:b.p.d-a.p.d};let depth=Infinity,normal;
  for(const axis of [...axes(a.p),...axes(b.p)]){
    const signed=dot(delta,axis),overlap=radius(a,axis)+radius(b,axis)-Math.abs(signed);
    if(overlap<0)return null;
    if(overlap<depth){depth=overlap;normal={x:axis.x*(signed<0?-1:1),y:axis.y*(signed<0?-1:1)};}
  }
  return {depth,normal};
}
/** Signed overlap depth, or null when separated. Useful for diagnostics and tests. */
export function vehicleOverlap(a,b){return contact(body(a),body(b))?.depth??null;}
function velocity(b){const [f,r]=axes(b.p);return {x:(b.p.u||0)*f.x+(b.p.v||0)*r.x,y:(b.p.u||0)*f.y+(b.p.v||0)*r.y};}
function setVelocity(b,v){const [f,r]=axes(b.p);b.p.u=dot(v,f);b.p.v=dot(v,r);}
function pointVelocity(b,arm){const v=velocity(b),r=b.p.r||0;return {x:v.x-r*arm.y,y:v.y+r*arm.x};}
function apply(b,j,arm){if(!b.im)return;const v=velocity(b);setVelocity(b,{x:v.x+j.x*b.im,y:v.y+j.y*b.im});b.p.r=(b.p.r||0)+cross(arm,j)*b.ii;}
function solve(a,b,c){
  const total=a.im+b.im;if(!total)return null;
  const n=c.normal,t={x:-n.y,y:n.x},ca={x:a.p.s,y:a.p.d},cb={x:b.p.s,y:b.p.d};
  // Centre of the shared face interval avoids artificial corner torque in straight rear impacts.
  const lo=Math.max(dot(ca,t)-radius(a,t),dot(cb,t)-radius(b,t));
  const hi=Math.min(dot(ca,t)+radius(a,t),dot(cb,t)+radius(b,t));
  const tangent=(lo+hi)/2,normal=(dot(ca,n)+radius(a,n)+dot(cb,n)-radius(b,n))/2;
  const point={x:n.x*normal+t.x*tangent,y:n.y*normal+t.y*tangent},ra=sub(point,ca),rb=sub(point,cb);
  const relative=sub(pointVelocity(b,rb),pointVelocity(a,ra)),vn=dot(relative,n);
  let j=0;
  if(vn<0){
    const denom=total+cross(ra,n)**2*a.ii+cross(rb,n)**2*b.ii;
    j=-(1+(vn< -2?.08:0))*vn/denom;
    apply(a,{x:-j*n.x,y:-j*n.y},ra);apply(b,{x:j*n.x,y:j*n.y},rb);
    const slip=dot(sub(pointVelocity(b,rb),pointVelocity(a,ra)),t);
    const jt=clamp(-slip/(total+cross(ra,t)**2*a.ii+cross(rb,t)**2*b.ii),-.28*j,.28*j);
    apply(a,{x:-jt*t.x,y:-jt*t.y},ra);apply(b,{x:jt*t.x,y:jt*t.y},rb);
  }
  const correction=c.depth+.001;
  a.p.s-=n.x*correction*a.im/total;a.p.d-=n.y*correction*a.im/total;
  b.p.s+=n.x*correction*b.im/total;b.p.d+=n.y*correction*b.im/total;
  return j>0?{a:a.p,b:b.p,strength:clamp(-vn/35,.03,1),closingSpeed:-vn,normalImpulse:j}:null;
}
function interpolate(p,from,to,t){p.s=from.s+(to.s-from.s)*t;p.d=from.d+(to.d-from.d)*t;const angle=Math.atan2(Math.sin(to.yaw-from.yaw),Math.cos(to.yaw-from.yaw));p.yaw=from.yaw+angle*t;}
function swept(a,b,pa,pb,dt){
  const ea=pose(a.p),eb=pose(b.p);
  const movement=Math.hypot(ea.s-pa.s,ea.d-pa.d)+Math.hypot(eb.s-pb.s,eb.d-pb.d);
  const angle=Math.abs(Math.atan2(Math.sin(ea.yaw-pa.yaw),Math.cos(ea.yaw-pa.yaw)))+Math.abs(Math.atan2(Math.sin(eb.yaw-pb.yaw),Math.cos(eb.yaw-pb.yaw)));
  const steps=Math.max(1,Math.ceil((movement+angle*3)/.18));
  // Reject pairs whose swept centre bounds cannot approach a vehicle diagonal.
  if(Math.min(pa.s,ea.s)>Math.max(pb.s,eb.s)+6||Math.min(pb.s,eb.s)>Math.max(pa.s,ea.s)+6||Math.min(pa.d,ea.d)>Math.max(pb.d,eb.d)+6||Math.min(pb.d,eb.d)>Math.max(pa.d,ea.d)+6)return null;
  let last=0,hit=null;
  for(let i=0;i<=steps;i++){
    const t=i/steps;interpolate(a.p,pa,ea,t);interpolate(b.p,pb,eb,t);
    if(contact(a,b)){let lo=last,hi=t;for(let k=0;k<12;k++){const mid=(lo+hi)/2;interpolate(a.p,pa,ea,mid);interpolate(b.p,pb,eb,mid);if(contact(a,b))hi=mid;else lo=mid;}
      interpolate(a.p,pa,ea,hi);interpolate(b.p,pb,eb,hi);hit=solve(a,b,contact(a,b));
      // Advance the unconsumed substep with post-contact velocities, then depenetrate again.
      for(const [v,end] of [[a,ea],[b,eb]]){if(!v.im){Object.assign(v.p,end);continue;}const speed=velocity(v),remaining=dt*(1-hi);v.p.s+=speed.x*remaining;v.p.d+=speed.y*remaining;v.p.yaw+=(v.p.r||0)*remaining;}
      return hit;
    }
    last=t;
  }
  Object.assign(a.p,ea);Object.assign(b.p,eb);return null;
}
/** Call after every physics step, independently of effect cooldowns. Previous is a Map from captureVehiclePoses(). */
export function resolveVehicleContacts(entries,{previous=null,dt=1/120,iterations=6}={}){
  const bodies=entries.map(body),impacts=[];
  if(previous)for(let i=0;i<bodies.length;i++)for(let k=i+1;k<bodies.length;k++){
    const a=bodies[i],b=bodies[k],pa=previous.get(a.p),pb=previous.get(b.p);if(!pa||!pb||!(a.im+b.im))continue;
    const impact=swept(a,b,pa,pb,dt);if(impact)impacts.push(impact);
  }
  for(let pass=0;pass<iterations;pass++)for(let i=0;i<bodies.length;i++)for(let k=i+1;k<bodies.length;k++){
    const a=bodies[i],b=bodies[k];if(Math.abs(a.p.s-b.p.s)>6||Math.abs(a.p.d-b.p.d)>6)continue;
    const c=contact(a,b);if(c){const impact=solve(a,b,c);if(impact)impacts.push(impact);}
  }
  return impacts;
}
