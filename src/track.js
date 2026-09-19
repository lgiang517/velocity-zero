import {createChinaRoute,CHINA_ROUTE_ID} from './china-route.js';
import {BARRIER} from './road-boundaries.js';
import * as THREE from 'three';
export class CoastTrack {
  constructor({legacy=false}={}){
    // One continuous island road: coast, climbing pass, hairpins, skyline, port, bridge.
    this.points=[ [0,22,0],[5,24,220],[-35,36,450],[-120,57,650],[-125,82,820],[20,114,985],[220,154,1140],[410,190,1050],[370,200,900],[210,192,810],[330,170,680],[570,148,760],[740,116,1010],[990,74,1130],[1210,35,960],[1280,24,680],[1255,20,350],[1130,21,90],[1170,23,-210],[1320,21,-440],[1180,23,-700],[850,33,-850],[540,53,-840],[260,61,-690],[110,48,-420],[30,26,-210] ];
    this.curve=new THREE.CatmullRomCurve3(this.points.map(p=>new THREE.Vector3(...p)),true,'catmullrom',.75);
    this.curve.arcLengthDivisions=5000;this.length=this.curve.getLength();
    this.legacyLength=this.length;this.routeId=legacy?'coast-v1':CHINA_ROUTE_ID;
    if(!legacy){
      this.legacyTrack=new CoastTrack({legacy:true});
      const route=createChinaRoute(this.curve,this.length);
      Object.assign(this,route);this.curve=route.curve;this.length=this.curve.getLength();
    }else {this.sections=[];this.extensionStartS=this.extensionEndS=this.length;}
    this.count=Math.ceil(this.length/3);this.step=this.length/this.count;this.samples=[];
    for(let i=0;i<=this.count;i++){
      const t=i/this.count,p=this.curve.getPointAt(t),tan=this.curve.getTangentAt(t).normalize();
      const right=new THREE.Vector3(tan.z,0,-tan.x).normalize();
      this.samples.push({s:i*this.step,p,tan,right,heading:Math.atan2(tan.x,tan.z),curvature:0,slope:tan.y,...this.roadProfile(i*this.step)});
    }
    for(let i=0;i<this.count;i++){const a=this.samples[(i-1+this.count)%this.count].heading,b=this.samples[(i+1)%this.count].heading;this.samples[i].curvature=Math.atan2(Math.sin(b-a),Math.cos(b-a))/(2*this.step);}
    this.samples[this.count]={...this.samples[0],s:this.length,p:this.samples[0].p.clone(),tan:this.samples[0].tan.clone(),right:this.samples[0].right.clone()};
    this.bounds={minX:Math.min(...this.samples.map(q=>q.p.x)),maxX:Math.max(...this.samples.map(q=>q.p.x)),minZ:Math.min(...this.samples.map(q=>q.p.z)),maxZ:Math.max(...this.samples.map(q=>q.p.z))};
  }
  section(id){return this.sections.find(section=>section.id===id)||null;}
  sectionAt(distance){const s=((distance%this.length)+this.length)%this.length;return this.sections.find(section=>s>=section.startS&&s<section.endS)||null;}
  sectionS(id,progress){const section=this.section(id);if(!section)throw new Error('Unknown route section: '+id);return section.startS+THREE.MathUtils.clamp(progress,0,1)*section.length;}
  legacyS(fraction){const t=THREE.MathUtils.clamp(fraction,0,1);if(!this.legacyTrack||t<=.89)return t*this.legacyLength;if(t>=.993)return this.extensionEndS+(t-.993)*this.legacyLength;return null;}
  roadProfile(distance){
    const s=((distance%this.length)+this.length)%this.length,hzmb=this.section('hzmb');let widthMix=0,medianHalfWidth=0;
    if(hzmb){
      widthMix=THREE.MathUtils.smoothstep(s,hzmb.startS-220,hzmb.startS)*(1-THREE.MathUtils.smoothstep(s,hzmb.endS,hzmb.endS+220));
      const local=s-hzmb.startS,from=hzmb.length*.08,to=hzmb.length*.94;
      medianHalfWidth=1.35*THREE.MathUtils.smoothstep(local,from,from+25)*(1-THREE.MathUtils.smoothstep(local,to-25,to));
    }
    return {widthMix,asphaltHalfWidth:THREE.MathUtils.lerp(8.4,14,widthMix),barrierOffset:THREE.MathUtils.lerp(BARRIER.offset,15.7,widthMix),medianHalfWidth};
  }
  // Existing lateral placements use the old road as their design coordinate.
  // Inside the asphalt scale with its width; outside the rail preserve offsets.
  roadLateral(distance,lateral){
    const {asphaltHalfWidth,barrierOffset}=this.roadProfile(distance),a=Math.abs(lateral),sign=Math.sign(lateral);
    if(a<=8.4)return sign*a*asphaltHalfWidth/8.4;
    if(a<=BARRIER.offset)return sign*THREE.MathUtils.lerp(asphaltHalfWidth,barrierOffset,(a-8.4)/(BARRIER.offset-8.4));
    return sign*(barrierOffset+a-BARRIER.offset);
  }
  sample(distance){
    const wrapped=((distance%this.length)+this.length)%this.length,idx=wrapped/this.step,i=Math.floor(idx),f=idx-i;
    const a=this.samples[i],b=this.samples[i+1];
    const section=this.sectionAt(wrapped);
    if(this.legacyTrack&&!section){const oldS=wrapped<this.extensionStartS?wrapped:this.legacyLength*.993+(wrapped-this.extensionEndS);return {...this.legacyTrack.sample(oldS),s:wrapped,sectionId:'legacy',...this.roadProfile(wrapped)};}
    return {s:wrapped,sectionId:section?.id||'legacy',...this.roadProfile(wrapped),p:a.p.clone().lerp(b.p,f),tan:a.tan.clone().lerp(b.tan,f).normalize(),right:a.right.clone().lerp(b.right,f).normalize(),heading:a.heading+Math.atan2(Math.sin(b.heading-a.heading),Math.cos(b.heading-a.heading))*f,curvature:a.curvature+(b.curvature-a.curvature)*f,slope:a.slope+(b.slope-a.slope)*f};
  }
  point(distance,lateral=0,height=0){const q=this.sample(distance);return q.p.addScaledVector(q.right,lateral).add(new THREE.Vector3(0,height,0));}
  region(s){if(this.legacyTrack){const section=this.sectionAt(s);if(section?.region)return section.region;if(section)return 'SCENIC CONNECTOR';const distance=((s%this.length)+this.length)%this.length;return this.legacyTrack.region(distance<this.extensionStartS?distance:this.legacyLength*.993+(distance-this.extensionEndS));}const t=((s%this.length)+this.length)%this.length/this.length;if(t<.20)return 'PACIFIC COAST HIGHWAY';if(t<.48)return 'KAZE MOUNTAIN PASS';if(t<.67)return 'SOLSTICE CITY';if(t<.78)return 'EASTERN PORT';if(t<.89)return 'HIGHLAND EXPRESSWAY';return 'HORIZON BRIDGE';}
  inTunnel(s){const wrapped=((s%this.length)+this.length)%this.length;const t=wrapped/this.legacyLength;return t>.22&&t<.26;}
  barrierGeometry(side){
    const pos=[],indices=[];
    for(const q of this.samples)for(const [d,h] of [[side*q.barrierOffset-BARRIER.halfThickness,BARRIER.bottom],[side*q.barrierOffset+BARRIER.halfThickness,BARRIER.bottom],[side*q.barrierOffset+BARRIER.halfThickness,BARRIER.top],[side*q.barrierOffset-BARRIER.halfThickness,BARRIER.top]])pos.push(q.p.x+q.right.x*d,q.p.y+h,q.p.z+q.right.z*d);
    for(let i=0;i<this.count;i++)for(let j=0;j<4;j++){const a=i*4+j,b=i*4+(j+1)%4,c=(i+1)*4+j,d=(i+1)*4+(j+1)%4;indices.push(a,b,c,b,d,c);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(indices);g.computeVertexNormals();return g;
  }
  // Dedicated road rendering grid. Explicit marking columns prevent a wide
  // diagonal triangle from bending constant-lateral shader lines in a turn.
  // Physics samples, barriers and the original two-vertex ribbon stay intact.
  roadRibbon(from=-8.4,to=8.4,height=0){
    const columns=[from,...[-7.65,-3.85,-2.1,-.12,0,.12,2.1,3.85,7.65].filter(d=>d>from&&d<to),to];
    const stations=[0];
    while(stations.at(-1)<this.length){
      const s=stations.at(-1),curvature=Math.max(...[0,1,2].map(a=>Math.abs(this.sample(s+a).curvature)));
      const step=Math.max(.65,Math.min(2,Math.sqrt(.055/Math.max(curvature,.000001))));
      stations.push(Math.min(this.length,s+step));
    }
    const segments=stations.length-1,stride=columns.length,pos=[],uv=[],widthMix=[],indices=[];
    for(let i=0;i<=segments;i++){
      const t=stations[i]/this.length,p=this.curve.getPointAt(i===segments?0:t),tan=this.curve.getTangentAt(i===segments?0:t);
      const right=new THREE.Vector3(tan.z,0,-tan.x).normalize();
      const profile=this.roadProfile(stations[i]);
      for(const canonical of columns){
        const mark=({7.65:13.1,3.85:9.35,2.1:5.6,.12:1.85})[Math.abs(canonical)];
        const d=mark===undefined?this.roadLateral(stations[i],canonical):Math.sign(canonical)*THREE.MathUtils.lerp(Math.abs(canonical),mark,profile.widthMix);
        pos.push(p.x+right.x*d,p.y+height,p.z+right.z*d);uv.push(d,t*this.length);widthMix.push(profile.widthMix);
      }
    }
    for(let i=0;i<segments;i++)for(let j=0;j<stride-1;j++){
      const k=i*stride+j;indices.push(k,k+stride,k+1,k+1,k+stride,k+stride+1);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
    g.setAttribute('roadWidthMix',new THREE.Float32BufferAttribute(widthMix,1));
    g.userData={lateralStations:columns,longitudinalSegments:segments,longitudinalStep:2,adaptiveCurvature:true};
    return g;
  }
  ribbon(from,to,height=0){
    const pos=[],uv=[],indices=[];
    for(let i=0;i<=this.count;i++){const q=this.samples[i];for(const canonical of [from,to]){const d=this.roadLateral(q.s,canonical);pos.push(q.p.x+q.right.x*d,q.p.y+height,q.p.z+q.right.z*d);uv.push(d,i*this.step);}}
    for(let i=0;i<this.count;i++){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
  }
}

