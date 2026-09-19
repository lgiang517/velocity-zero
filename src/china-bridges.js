import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const CHINA_BRIDGE_KINDS=Object.freeze({jiuzhou:'sail',jianghai:'dolphin',qingzhou:'chinese-knot',sichuan:'suspension'});

const UP=new THREE.Vector3(0,1,0);
const COLORS={concrete:'#c0c1b7',pier:'#b8bbb4',steel:'#cdd6d4',web:'#717e7e',edge:'#d3d5ca',dark:'#394e54',joint:'#4d5956',lamp:'#e7e4ca'};

// Clip the actual coarse terrain triangles against an oriented footing. A
// centre-height lookup alone leaves the downhill edge hovering on steep ramps.
// This is a one-time construction query; it adds no geometry or frame work.
function foundationTerrain(world,point,heading,width,depth){
  const field=world.coastalHeightField,cs=Math.cos(heading),sn=Math.sin(heading);
  const extentX=(Math.abs(cs)*width+Math.abs(sn)*depth)/2,extentZ=(Math.abs(sn)*width+Math.abs(cs)*depth)/2;
  // New western terrain uses a different 32 m grid. Query its visible meshes
  // during construction instead of confusing the analytic function with that
  // interpolated surface, or clamping to the old coast texture's border.
  const terrainMeshes=(world.chinaTerrain?.meshes||[]).filter(mesh=>{
    if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();mesh.updateWorldMatrix(true,false);
    const b=mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
    return b.max.x>=point.x-extentX&&b.min.x<=point.x+extentX&&b.max.z>=point.z-extentZ&&b.min.z<=point.z+extentZ;
  });
  if(terrainMeshes.length){
    const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),heights=[];let center=world.groundHeight(point.x,point.z);
    for(let ix=-2;ix<=2;ix++)for(let iz=-2;iz<=2;iz++){
      const x=point.x+ix*width/4*cs+iz*depth/4*sn,z=point.z-ix*width/4*sn+iz*depth/4*cs;
      ray.set(new THREE.Vector3(x,10000,z),down);ray.far=20000;
      const hit=ray.intersectObjects(terrainMeshes,false)[0],y=hit?hit.point.y:world.groundHeight(x,z);heights.push(y);if(ix===0&&iz===0)center=y;
    }
    return {minimum:Math.min(...heights),center,source:'china-mesh'};
  }
  const outside=field&&(point.x-extentX<field.bounds.x||point.x+extentX>field.bounds.x+field.bounds.z||point.z-extentZ<field.bounds.y||point.z+extentZ>field.bounds.y+field.bounds.w);
  if(!field||outside){
    const heights=[];
    for(const x of[-width/2,-width/4,0,width/4,width/2])for(const z of[-depth/2,-depth/4,0,depth/4,depth/2])heights.push(world.groundHeight(point.x+x*cs+z*sn,point.z-x*sn+z*cs));
    return {minimum:Math.min(...heights),center:world.groundHeight(point.x,point.z),source:'analytic'};
  }
  const {bounds:b,size,texture}=field,data=texture.image.data,stepX=b.z/(size.x-1),stepZ=b.w/(size.y-1);
  const height=(x,z)=>{const k=(z*size.x+x)*4;return (data[k]*256+data[k+1])*512/65535-32;};
  const vertex=(x,z)=>{const dx=b.x+x*stepX-point.x,dz=b.y+z*stepZ-point.z;return {x:dx*cs-dz*sn,y:height(x,z),z:dx*sn+dz*cs};};
  const x0=Math.max(0,Math.floor((point.x-extentX-b.x)/stepX)),x1=Math.min(size.x-2,Math.floor((point.x+extentX-b.x)/stepX));
  const z0=Math.max(0,Math.floor((point.z-extentZ-b.y)/stepZ)),z1=Math.min(size.y-2,Math.floor((point.z+extentZ-b.y)/stepZ));
  function clip(polygon,axis,sign,limit){
    const out=[];if(!polygon.length)return out;
    let previous=polygon.at(-1),before=previous[axis]*sign-limit;
    for(const current of polygon){
      const after=current[axis]*sign-limit;
      if((before<=0)!==(after<=0)){const f=before/(before-after);out.push({x:previous.x+(current.x-previous.x)*f,y:previous.y+(current.y-previous.y)*f,z:previous.z+(current.z-previous.z)*f});}
      if(after<=0)out.push(current);previous=current;before=after;
    }
    return out;
  }
  let minimum=Infinity;
  for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
    const a=vertex(x,z),c=vertex(x+1,z),b=vertex(x,z+1),d=vertex(x+1,z+1);
    for(let polygon of[[a,b,c],[c,b,d]]){
      for(const[axis,sign,limit]of[['x',1,width/2],['x',-1,width/2],['z',1,depth/2],['z',-1,depth/2]])polygon=clip(polygon,axis,sign,limit);
      for(const p of polygon)minimum=Math.min(minimum,p.y);
    }
  }
  const gx=THREE.MathUtils.clamp((point.x-b.x)/stepX,0,size.x-1),gz=THREE.MathUtils.clamp((point.z-b.y)/stepZ,0,size.y-1),x=Math.min(size.x-2,Math.floor(gx)),z=Math.min(size.y-2,Math.floor(gz)),u=gx-x,v=gz-z;
  const center=u+v<=1?height(x,z)*(1-u-v)+height(x+1,z)*u+height(x,z+1)*v:height(x+1,z+1)*(u+v-1)+height(x+1,z)*(1-v)+height(x,z+1)*(1-u);
  return {minimum:Number.isFinite(minimum)?minimum:center,center,source:'coastal-field'};
}

// Bevels retain an engineered silhouette without high segment counts. Unlike
// scaled cylinders, these piers have the broad flat faces of cast concrete.
function beveledPier(width,depth,height,topScale=1){
  const b=Math.min(width,depth)*.17,loop=[[-width/2+b,-depth/2],[width/2-b,-depth/2],[width/2,-depth/2+b],[width/2,depth/2-b],[width/2-b,depth/2],[-width/2+b,depth/2],[-width/2,depth/2-b],[-width/2,-depth/2+b]],p=[],idx=[];
  for(const y of [-height/2,height/2])for(const [x,z]of loop){const k=y>0?topScale:1;p.push(x*k,y,z*k);}
  for(let i=0;i<8;i++){const j=(i+1)%8;idx.push(i,j,i+8,j,j+8,i+8);}
  for(let i=1;i<7;i++)idx.push(0,i+1,i,8,8+i,9+i);
  for(let i=0;i<idx.length;i+=3){const b=idx[i+1];idx[i+1]=idx[i+2];idx[i+2]=b;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();
  // Flat construction faces and chamfers must not become inflated cylinders.
  const flat=g.toNonIndexed();g.dispose();flat.computeVertexNormals();return flat;
}

function sweptSection(track,start,end,profile,step=10){
  const count=Math.ceil((end-start)/step),pos=[],idx=[],first=typeof profile==='function'?profile(start):profile,n=first.length,stations=[];
  for(let i=0;i<=count;i++){
    const s=start+(end-start)*i/count,q=track.sample(s);stations.push(s);
    for(const[d,h]of (typeof profile==='function'?profile(s):profile)){const p=q.p.clone().addScaledVector(q.right,d);pos.push(p.x,p.y+h,p.z);}
  }
  for(let i=0;i<count;i++)for(let j=0;j<n;j++){const a=i*n+j,b=i*n+(j+1)%n,c=a+n,d=b+n;idx.push(a,b,c,b,d,c);}
  for(let i=1;i<n-1;i++){idx.push(0,i+1,i);const k=count*n;idx.push(k,k+i,k+i+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();
  const flat=g.toNonIndexed();g.dispose();flat.computeVertexNormals();flat.userData={stations,profile:first};return flat;
}

function concreteMaterial(){
  const material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.85,metalness:.04});
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vBridgeWorld;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvBridgeWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader='varying vec3 vBridgeWorld;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float bridgeGrain=fract(sin(dot(floor(vBridgeWorld*11.),vec3(12.9898,4.1414,78.233)))*43758.5453);
      float bridgeJoint=1.-smoothstep(.008,.032,abs(mod(vBridgeWorld.y+2.25,4.5)-2.25));
      float bridgeStreak=pow(.5+.5*sin(vBridgeWorld.x*2.7+vBridgeWorld.z*1.9),12.);
      diffuseColor.rgb*=.975+bridgeGrain*.045-bridgeJoint*.025-bridgeStreak*.028;`);
  };
  material.customProgramCacheKey=()=> 'china-bridge-concrete-v1';return material;
}

/** Curved bridge structures follow the existing driving mesh; physics is unchanged. */
export function buildChinaBridges(world){
  const {track,scene}=world,group=new THREE.Group();group.name='China route bridges';scene.add(group);
  const concrete=concreteMaterial(),steel=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.48,metalness:.3});
  const lamp=new THREE.MeshStandardMaterial({color:'#fff1d2',vertexColors:true,roughness:.35,emissive:'#ffe7ad',emissiveIntensity:.08,toneMapped:false}),materials={concrete,steel,lamp};
  const registeredFixtures=world.streetLampFixtures??(world.streetLampFixtures=[]),lampMaterials=world.bridgeLampMaterials??(world.bridgeLampMaterials=[]),ownedFixtures=[];lampMaterials.push(lamp);
  function roadProfile(s){return track.roadProfile?.(s)||{widthMix:0,asphaltHalfWidth:8.4,barrierOffset:9.85,medianHalfWidth:track.sample(s).medianHalfWidth};}
  const batches=new Map(),box=new THREE.BoxGeometry(1,1,1),cylinder=new THREE.CylinderGeometry(1,1,1,6,1,false);
  const metadata={sections:[],decks:[],piers:[],towers:[],cables:[],lamps:[],mainCables:[],anchorages:[],navigationSpans:[],knots:[],medians:[]};
  const stats={triangles:0,batches:0,piers:0,towers:0,stayCables:0,suspensionHangers:0,lamps:0,textureCount:0,lights:0};
  let disposed=false;
  function add(g,s,color,material='concrete',shadow=false){
    const key=`${Math.floor(s/240)}|${material}|${shadow}`,colorValue=new THREE.Color(color),array=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<g.attributes.position.count;i++)colorValue.toArray(array,i*3);
    g.deleteAttribute('uv');g.setAttribute('color',new THREE.BufferAttribute(array,3));
    if(!batches.has(key))batches.set(key,{geometries:[],material:materials[material],shadow});batches.get(key).geometries.push(g);
  }
  function transformed(proto,position,scale,quaternion){
    const g=proto.index?proto.toNonIndexed():proto.clone();g.applyMatrix4(new THREE.Matrix4().compose(position,quaternion||new THREE.Quaternion(),scale));return g;
  }
  function block(s,d,h,w,y,z,color=COLORS.concrete,{shadow=false,material='concrete',grade=false}={}){
    const q=track.sample(s),pitch=grade?-Math.atan2(q.tan.y,Math.hypot(q.tan.x,q.tan.z)):0;add(transformed(box,track.point(s,d,h),new THREE.Vector3(w,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,q.heading,0,'YXZ'))),s,color,material,shadow);
  }
  function line(a,b,radius,s,color=COLORS.steel,shadow=false){
    const delta=b.clone().sub(a);add(transformed(cylinder,a.clone().add(b).multiplyScalar(.5),new THREE.Vector3(radius,delta.length(),radius),new THREE.Quaternion().setFromUnitVectors(UP,delta.normalize())),s,color,'steel',shadow);
  }
  function pier(name,s,d,width,depth,top,{taper=.83,shade=COLORS.pier}={}){
    const q=track.sample(s),p=track.point(s,d),ground=world.groundHeight(p.x,p.z);
    const terrain=foundationTerrain(world,p,q.heading,width+2.2,depth+2.2),footingTop=ground+.9;
    const footingBottom=Math.min(ground-1.4,terrain.minimum-.85),bottom=Math.min(ground-1.8,terrain.center-1.1,footingTop-.75),height=top-bottom;
    if(!(height>0))return;
    const centre=p.clone();centre.y=(bottom+top)/2;
    const g=beveledPier(width,depth,height,taper);g.rotateY(q.heading);g.translate(centre.x,centre.y,centre.z);add(g,s,shade);
    const record={name,s,lateral:d,width,depth,bottom,top,ground,center:centre.toArray(),footingBottom,footingTop,renderedGround:terrain.center,footprintGroundMin:terrain.minimum,terrainSource:terrain.source};metadata.piers.push(record);stats.piers++;
    // Retain the designed foundation top and extend only its buried volume.
    // The shaft overlaps it even when analytic and rendered ground disagree.
    block(s,d,(footingTop+footingBottom)/2-q.p.y,width+2.2,footingTop-footingBottom,depth+2.2,shade);return record;
  }
  function deck(name,start,end,depth,color=COLORS.concrete){
    const spread=s=>3.39*roadProfile(s).widthMix;
    const profile=s=>{const d=spread(s);return [[-13.1-d,-.22],[-13.1-d,-.62],[-10.5-d,-.83],[-8.8-d,-depth],[8.8+d,-depth],[10.5+d,-.83],[13.1+d,-.62],[13.1+d,-.22]];};
    for(let s=start;s<end;s+=120){
      const e=Math.min(end,s+120);add(sweptSection(track,s,e,profile),s,color);
      for(const side of[-1,1]){
        add(sweptSection(track,s,e,station=>{
          const mix=roadProfile(station).widthMix,outer=side*THREE.MathUtils.lerp(12.65,16.47,mix),inner=side*THREE.MathUtils.lerp(10.38,15.8,mix);
          return [[Math.min(inner,outer),-.04],[Math.max(inner,outer),-.04],[Math.max(inner,outer),-.22],[Math.min(inner,outer),-.22]];
        }),s,COLORS.edge);
        add(sweptSection(track,s,e,station=>{const ext=spread(station),d0=Math.min(side*(13.1+ext),side*(13.16+ext)),d1=Math.max(side*(13.1+ext),side*(13.16+ext));return [[d0,-.34],[d0,-.52],[d1,-.52],[d1,-.34]];}),s,COLORS.web,'steel');
      }
      metadata.decks.push({name,start:s,end:e,top:-.04,structuralTop:-.22,bottom:-depth,halfWidthStart:13.16+spread(s),halfWidthEnd:13.16+spread(e)});
    }
  }
  function lamps(name,start,end){
    for(let s=start+14;s<end-10;s+=42)for(const side of[-1,1]){
      const profile=roadProfile(s),d=side*THREE.MathUtils.lerp(11.15,16.18,profile.widthMix),baseWidth=THREE.MathUtils.lerp(.62,.54,profile.widthMix),headD=d-side*2.93;
      block(s,d,.16,baseWidth,.4,.72,COLORS.concrete);
      const foot=track.point(s,d,.33),elbow=track.point(s,d,8.5),tip=track.point(s,d-side*2.7,9.05);
      line(foot,elbow,.075,s,COLORS.web);line(elbow,tip,.055,s,COLORS.web);
      block(s,headD,9.02,.62,.12,1.02,'#ffffff',{material:'lamp'});
      const q=track.sample(s),position=track.point(s,headD,8.94),roadPoint=track.point(s,side*(profile.asphaltHalfWidth+profile.medianHalfWidth)*.5,.055),fixture={position,roadPoint,source:'bridge',bridge:name,s,heading:q.heading,slope:q.slope};
      registeredFixtures.push(fixture);ownedFixtures.push(fixture);
      metadata.lamps.push({name,s,lateral:d,baseWidth,barrierOffset:profile.barrierOffset,baseY:track.sample(s).p.y-.04,topY:tip.y,position:position.toArray(),roadPoint:roadPoint.toArray()});stats.lamps++;
    }
  }
  function tube(points,radius,s,color=COLORS.steel,segments=points.length*2){
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),segments,radius,6,false).toNonIndexed(),s,color,'steel');
  }
  function bar(a,b,width,s,color=COLORS.dark){
    const delta=b.clone().sub(a);add(transformed(box,a.clone().add(b).multiplyScalar(.5),new THREE.Vector3(width,delta.length(),width),new THREE.Quaternion().setFromUnitVectors(UP,delta.normalize())),s,color,'steel');
  }
  function sculptedMast(s,controls,width,depth){
    const q=track.sample(s),curve=new THREE.CatmullRomCurve3(controls),positions=[],indices=[],segments=32;
    const ring=[[-.33,-.5],[.33,-.5],[.5,-.33],[.5,.33],[.33,.5],[-.33,.5],[-.5,.33],[-.5,-.33]];
    for(let i=0;i<=segments;i++){
      const t=i/segments,p=curve.getPoint(t),tan=curve.getTangent(t),across=q.right,along=new THREE.Vector3().crossVectors(across,tan).normalize();
      const w=typeof width==='function'?width(t):width,d=typeof depth==='function'?depth(t):depth;
      for(const[x,z]of ring){const v=p.clone().addScaledVector(across,x*w).addScaledVector(along,z*d);positions.push(v.x,v.y,v.z);}
    }
    for(let i=0;i<segments;i++)for(let j=0;j<8;j++){const a=i*8+j,b=i*8+(j+1)%8,c=a+8,d=b+8;indices.push(a,c,b,b,c,d);}
    for(let i=1;i<7;i++){indices.push(0,i,i+1);const k=segments*8;indices.push(k,k+i+1,k+i);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
    add(g.toNonIndexed(),s,COLORS.steel,'steel');g.dispose();
  }
  function singlePlaneFan(name,s,spanStart,spanEnd,height){
    for(const direction of[-1,1]){
      const section=track.section('hzmb'),medianStart=section.startS+section.length*.08+25,medianEnd=section.startS+section.length*.94-25;
      const reach=Math.min(direction<0?s-Math.max(spanStart,medianStart):Math.min(spanEnd,medianEnd)-s,145);
      for(let i=0;i<14;i++){
        const h=height*.55+height*.42*i/13,topOffset=name==='jianghai'?8.5*Math.pow(h/84,1.8):0;
        const anchorS=s+direction*(24+(reach-24)*i/13),anchor=track.point(anchorS,0,.75),top=track.point(s+topOffset,0,h);
        line(anchor,top,.085,s,COLORS.steel);metadata.cables.push({name,kind:'stay',zone:'median',towerS:s,anchorS,side:0,radius:.085,start:anchor.toArray(),end:top.toArray()});stats.stayCables++;
      }
    }
  }
  function median(section){
    const start=section.startS+section.length*.08,end=section.startS+section.length*.94;
    // Every ring samples the same width used by collision detection. Narrowing
    // ramps cannot expose a visually wide block before its physical barrier.
    for(let s=start;s<end;s+=120){
      const e=Math.min(end,s+120);
      const taper=s<start+30||e>end-30,geometry=sweptSection(track,s,e,station=>{const w=track.sample(station).medianHalfWidth||0;return [[-w,0],[w,0],[w,.72],[-w,.72]];},taper?1:12);
      add(geometry,s,COLORS.concrete);
      for(let r=s;r<e;r+=taper?1:120){const next=Math.min(e,r+(taper?1:120));for(const side of[-1,1])line(track.point(r,side*track.sample(r).medianHalfWidth,.9),track.point(next,side*track.sample(next).medianHalfWidth,.9),.045,r,COLORS.web);}
    }
    metadata.medians.push({start,end,halfWidth:1.35,taperStationStep:1,coreStationStep:12});
  }
  function hzmb(){
    const section=track.section('hzmb'),start=section.startS,end=section.endS;
    metadata.sections.push({name:'hzmb',start,end});deck('hzmb',start,end,2.7);median(section);
    const spans=section.spans;
    for(const span of spans){
      const spanStart=start+span.start,spanEnd=start+span.end,towers=span.towers.map(x=>start+x);
      metadata.navigationSpans.push({name:span.id,start:spanStart,end:spanEnd,towers,mainSpans:towers.slice(1).map((v,i)=>v-towers[i])});
      for(const s of towers){
        const q=track.sample(s);
        if(span.id==='jiuzhou'){
          const height=92,bottom=-28;
          pier('jiuzhou-foundation',s,0,2.45,10,q.p.y-3,{taper:.96,shade:COLORS.steel});
          sculptedMast(s,[track.point(s,0,bottom),track.point(s,0,height)],t=>2.35-t*.85,t=>3.4-t*1.75);
          const bow=[];for(let i=0;i<=12;i++){const t=i/12,h=bottom+(height-bottom)*t;bow.push(track.point(s+13*Math.sin(Math.PI*t),0,h));}
          sculptedMast(s,bow,t=>2.2-t*.7,t=>2.7-t*.9);
          for(let h=8;h<height-4;h+=11){const t=(h-bottom)/(height-bottom);bar(track.point(s,0,h),track.point(s+13*Math.sin(Math.PI*t),0,h+1.2),.72,s,COLORS.steel);}
          metadata.towers.push({name:'hzmb',id:span.id,kind:'sail',s,lateral:0,width:2.45,height,median:true,profile:'curved-open-frame'});stats.towers++;
          singlePlaneFan(span.id,s,spanStart,spanEnd,height);
        }else if(span.id==='jianghai'){
          const height=84;
          pier('jianghai-foundation',s,0,2.45,10,q.p.y-3,{taper:.96,shade:COLORS.steel});
          const controls=[[-1,-25],[0,0],[1.2,23],[2.5,47],[4.8,65],[7.0,76],[8.5,84]].map(([offset,h])=>track.point(s+offset,0,h));
          sculptedMast(s,controls,t=>2.35-.95*t,t=>7.8*Math.sin(Math.PI*(.13+.72*t))+.65);
          // A slimmer convex spine follows the dolphin's raised curved nose.
          sculptedMast(s,controls.map((p,i)=>p.clone().addScaledVector(q.tan,-(1.3-.13*i))),t=>1.25-.4*t,t=>2.2-t);
          metadata.towers.push({name:'hzmb',id:span.id,kind:'dolphin',s,lateral:0,width:2.45,height,median:true,profile:'curved-tapered-box'});stats.towers++;
          singlePlaneFan(span.id,s,spanStart,spanEnd,height);
        }else{
          const height=112;
          for(const side of[-1,1])pier('qingzhou-tower',s,side*18.2,3.8,4.3,q.p.y+height,{taper:.7,shade:COLORS.steel});
          block(s,0,-4.4,40.2,2.6,5.2,COLORS.concrete);
          // Two closed, woven lozenges have curved shoulders and a clear central
          // eye, following the official Qingzhou tower photo instead of an X.
          const centreY=88;
          for(const flip of[-1,1]){
            const xy=[[-12,66],[-8,72],[-3,79],[3.8,88],[9,98],[12,108],[7,102],[1,95],[-5,87],[-7.1,80],[-3.2,76],[2,81],[7.5,91],[12,99]].map(([x,y],i)=>track.point(s+Math.sin(i*.8)*.7,flip*x*1.44,y));
            tube(xy,.58,s,COLORS.steel,72);
          }
          const eye=[];for(let i=0;i<=24;i++){const a=i/24*Math.PI*2;eye.push(track.point(s+Math.sin(a)*.9,Math.sin(a)*4.4,centreY+Math.cos(a)*4.9));}tube(eye,.54,s,COLORS.steel,48);
          metadata.knots.push({s,closedEye:true,curvedStrands:2,eyeHeight:centreY});
          metadata.towers.push({name:'hzmb',id:span.id,kind:'chinese-knot',s,lateral:18.2,width:3.8,height,crossbeamBottom:65,profile:'double-column-woven-knot'});stats.towers++;
          for(const side of[-1,1])for(const direction of[-1,1]){
            const reach=Math.min(direction<0?s-spanStart:spanEnd-s,225);
            for(let i=0;i<18;i++){
              const anchorS=s+direction*(27+(reach-27)*i/17),anchor=track.point(anchorS,side*16.1,.12),top=track.point(s,side*18.2,69+i*2.15);
              line(anchor,top,.09,s,COLORS.steel);block(anchorS,side*16.1,.14,.5,.3,1.05,COLORS.web,{material:'steel'});
              metadata.cables.push({name:span.id,kind:'stay',zone:'outside',towerS:s,anchorS,side,radius:.09,start:anchor.toArray(),end:top.toArray()});stats.stayCables++;
            }
          }
        }
      }
    }
    // Navigation openings have no false intermediate piers. The repetitive
    // supports belong to approach spans and join the seven sculptural towers.
    for(let s=start+20;s<end-8;s+=48){
      if(metadata.navigationSpans.some(span=>s>span.towers[0]-22&&s<span.towers.at(-1)+22))continue;
      const q=track.sample(s);for(const d of[-5.6,5.6])pier('hzmb-approach',s,d,2.7,3.4,q.p.y-3.7);
      block(s,0,-3.2,26.6,1.25,4.1,COLORS.concrete);
    }
    lamps('hzmb',start,end);
  }
  function sichuan(){
    const section=track.section('sichuan'),start=section.startS,end=section.endS,a=start+section.mainSpan[0],b=start+section.mainSpan[1];
    metadata.sections.push({name:'sichuan',start,end,mainSpanStart:a,mainSpanEnd:b});deck('sichuan',start,end,.88,COLORS.web);
    const towerHeight=104,towerColor='#973e34',cableD=12.65;
    for(const s of[a,b]){
      const q=track.sample(s);
      for(const side of[-1,1]){
        pier('xingkang-tower',s,side*14.8,4.6,5.7,q.p.y+towerHeight,{taper:.80,shade:towerColor});
        block(s,side*14.8,99,4.1,3.1,5.2,'#e4d7be');
      }
      for(const h of[16,55,94])block(s,0,h,33.5,h===16?3.1:2.8,4.7,'#dbd6c6',{shadow:true});
      metadata.towers.push({name:'sichuan',id:'xingkang',kind:'suspension',s,lateral:14.8,width:4.6,height:towerHeight,crossbeamBottom:14.45});stats.towers++;
    }
    const anchorA=start+75,anchorB=end-70;
    for(const side of[-1,1]){
      const controls=[];
      for(let i=0;i<=24;i++){const t=i/24,s=anchorA+(a-anchorA)*t;controls.push(track.point(s,side*(18+(cableD-18)*t),6+92*t*t));}
      for(let i=1;i<=80;i++){const t=i/80,s=a+(b-a)*t;controls.push(track.point(s,side*cableD,18+80*(2*t-1)**2));}
      for(let i=1;i<=24;i++){const t=i/24,s=b+(anchorB-b)*t;controls.push(track.point(s,side*(cableD+(18-cableD)*t),6+92*(1-t)**2));}
      tube(controls,.34,(a+b)/2,'#96463b',152);
      metadata.mainCables.push({name:'xingkang',side,points:controls.map(p=>p.toArray()),startS:anchorA,endS:anchorB,mainSpanStart:a,mainSpanEnd:b});
      for(const s of[anchorA,anchorB]){
        const q=track.sample(s),record=pier('xingkang-anchorage',s,side*18,8.5,15,q.p.y+8,{taper:.86,shade:'#a9a69a'});
        metadata.anchorages.push({s,side,lateral:side*18,top:q.p.y+8,bottom:record?.bottom});
      }
      for(let s=a+11;s<b-7;s+=14){
        const t=(s-a)/(b-a),bottom=track.point(s,side*cableD,-.45),top=track.point(s,side*cableD,18+80*(2*t-1)**2);
        line(bottom,top,.065,s,'#b1b6b3');metadata.cables.push({name:'xingkang',kind:'hanger',zone:'outside',towerS:null,anchorS:s,side,radius:.065,start:bottom.toArray(),end:top.toArray()});stats.suspensionHangers++;
      }
    }
    // Open steel Warren trusses are intentionally different from a solid box
    // girder. Repeated diagonals, chords and cross beams remain visible below.
    for(let s=start+7;s<end-7;s+=18){
      const e=Math.min(end-7,s+18);
      for(const side of[-1,1]){
        const p0=track.point(s,side*11.75,-1.05),p1=track.point(e,side*11.75,-1.05),p2=track.point(e,side*11.75,-6.15),p3=track.point(s,side*11.75,-6.15);
        bar(p0,p1,.36,s);bar(p3,p2,.36,s);bar(p0,p3,.28,s);bar((Math.round((s-start)/18)%2)?p0:p3,(Math.round((s-start)/18)%2)?p2:p1,.29,s);
      }
      bar(track.point(s,-11.75,-5.95),track.point(s,11.75,-5.95),.3,s);
    }
    for(let s=start+15;s<end-10;s+=52){
      if(s>a-30&&s<b+30)continue;
      const q=track.sample(s);for(const side of[-1,1])pier('xingkang-approach',s,side*5.7,3.2,4.2,q.p.y-7.2);
      block(s,0,-6.6,22,1.2,4.5,COLORS.concrete);
    }
    lamps('sichuan',start,end);
  }
  function connectors(){
    for(const section of track.sections.filter(s=>s.id==='connector'&&s.elevated)){
      const start=section.startS,end=section.endS,name=section.kind||'connector';metadata.sections.push({name,start,end,connector:true});deck(name,start,end,2.7);
      for(let s=start+14;s<end-8;s+=46){
        const q=track.sample(s);for(const d of[-5.6,5.6])pier(name+'-approach',s,d,2.8,3.8,q.p.y-3.7);
        block(s,0,-3.15,20+6.6*roadProfile(s).widthMix,1.3,4.2,COLORS.concrete);
      }
      lamps(name,start,end);
    }
  }
  hzmb();sichuan();connectors();
  for(const [key,batch]of batches){
    const geometry=mergeGeometries(batch.geometries,false);batch.geometries.forEach(g=>g.dispose());
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,batch.material);mesh.name=`China bridge ${key}`;mesh.castShadow=batch.shadow;mesh.receiveShadow=true;group.add(mesh);
    stats.triangles+=geometry.attributes.position.count/3;stats.batches++;
  }
  box.dispose();cylinder.dispose();
  return {group,stats,metadata,dispose(){if(disposed)return;disposed=true;group.traverse(object=>{if(object.isMesh)object.geometry.dispose();});Object.values(materials).forEach(material=>material.dispose());for(const fixture of ownedFixtures){const index=registeredFixtures.indexOf(fixture);if(index>=0)registeredFixtures.splice(index,1);}const materialIndex=lampMaterials.indexOf(lamp);if(materialIndex>=0)lampMaterials.splice(materialIndex,1);group.removeFromParent();}};
}
