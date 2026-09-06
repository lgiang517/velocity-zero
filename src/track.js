import {BARRIER} from './road-boundaries.js';
import * as THREE from 'three';
export class CoastTrack {
  constructor(){
    // One continuous island road: coast, climbing pass, hairpins, skyline, port, bridge.
    this.points=[ [0,22,0],[5,24,220],[-35,36,450],[-120,57,650],[-125,82,820],[20,114,985],[220,154,1140],[410,190,1050],[370,200,900],[210,192,810],[330,170,680],[570,148,760],[740,116,1010],[990,74,1130],[1210,35,960],[1280,24,680],[1255,20,350],[1130,21,90],[1170,23,-210],[1320,21,-440],[1180,23,-700],[850,33,-850],[540,53,-840],[260,61,-690],[110,48,-420],[30,26,-210] ];
    this.curve=new THREE.CatmullRomCurve3(this.points.map(p=>new THREE.Vector3(...p)),true,'catmullrom',.38);
    this.curve.arcLengthDivisions=5000;this.length=this.curve.getLength();this.count=Math.ceil(this.length/3);this.step=this.length/this.count;this.samples=[];
    for(let i=0;i<=this.count;i++){
      const t=i/this.count,p=this.curve.getPointAt(t),tan=this.curve.getTangentAt(t).normalize();
      const right=new THREE.Vector3(tan.z,0,-tan.x).normalize();
      this.samples.push({p,tan,right,heading:Math.atan2(tan.x,tan.z),curvature:0,slope:tan.y});
    }
    for(let i=0;i<this.count;i++){const a=this.samples[(i-1+this.count)%this.count].heading,b=this.samples[(i+1)%this.count].heading;this.samples[i].curvature=Math.atan2(Math.sin(b-a),Math.cos(b-a))/(2*this.step);}
    this.samples[this.count]={...this.samples[0],p:this.samples[0].p.clone(),tan:this.samples[0].tan.clone(),right:this.samples[0].right.clone()};
  }
  sample(distance){
    const wrapped=((distance%this.length)+this.length)%this.length,idx=wrapped/this.step,i=Math.floor(idx),f=idx-i;
    const a=this.samples[i],b=this.samples[i+1];
    return {p:a.p.clone().lerp(b.p,f),tan:a.tan.clone().lerp(b.tan,f).normalize(),right:a.right.clone().lerp(b.right,f).normalize(),heading:a.heading+Math.atan2(Math.sin(b.heading-a.heading),Math.cos(b.heading-a.heading))*f,curvature:a.curvature+(b.curvature-a.curvature)*f,slope:a.slope+(b.slope-a.slope)*f};
  }
  point(distance,lateral=0,height=0){const q=this.sample(distance);return q.p.addScaledVector(q.right,lateral).add(new THREE.Vector3(0,height,0));}
  region(s){const t=((s%this.length)+this.length)%this.length/this.length;if(t<.20)return 'PACIFIC COAST HIGHWAY';if(t<.48)return 'KAZE MOUNTAIN PASS';if(t<.67)return 'SOLSTICE CITY';if(t<.78)return 'EASTERN PORT';if(t<.89)return 'HIGHLAND EXPRESSWAY';return 'HORIZON BRIDGE';}
  inTunnel(s){const t=((s%this.length)+this.length)%this.length/this.length;return t>.22&&t<.26;}
  barrierGeometry(side){
    const pos=[],indices=[];
    for(const q of this.samples)for(const [d,h] of [[side*BARRIER.offset-BARRIER.halfThickness,BARRIER.bottom],[side*BARRIER.offset+BARRIER.halfThickness,BARRIER.bottom],[side*BARRIER.offset+BARRIER.halfThickness,BARRIER.top],[side*BARRIER.offset-BARRIER.halfThickness,BARRIER.top]])pos.push(q.p.x+q.right.x*d,q.p.y+h,q.p.z+q.right.z*d);
    for(let i=0;i<this.count;i++)for(let j=0;j<4;j++){const a=i*4+j,b=i*4+(j+1)%4,c=(i+1)*4+j,d=(i+1)*4+(j+1)%4;indices.push(a,b,c,b,d,c);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(indices);g.computeVertexNormals();return g;
  }
  ribbon(from,to,height=0){
    const pos=[],uv=[],indices=[];
    for(let i=0;i<=this.count;i++){const q=this.samples[i];for(const d of [from,to]){pos.push(q.p.x+q.right.x*d,q.p.y+height,q.p.z+q.right.z*d);uv.push(d,i*this.step);}}
    for(let i=0;i<this.count;i++){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
  }
}

