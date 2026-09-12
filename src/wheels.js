import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
const pools=new Map();

// Geometry uses X as the axle. The outward face is +X and meshes mirror for the other side.
function lathe(profile,segments){
 const p=[],uv=[],ix=[];
 for(let j=0;j<profile.length;j++)for(let i=0;i<=segments;i++){
  const a=i/segments*Math.PI*2,[x,r]=profile[j];p.push(x,Math.cos(a)*r,Math.sin(a)*r);uv.push(i/segments,(x+.14)/.28);
 }
 for(let j=0;j<profile.length-1;j++)for(let i=0;i<segments;i++){
  const a=j*(segments+1)+i,b=a+segments+1;ix.push(a,a+1,b,a+1,b+1,b);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;
}
function annulus(x,inner,outer,depth,segments){return lathe([[x-depth,inner],[x-depth,outer],[x,outer],[x,inner],[x-depth,inner]],segments);}
function disc(r,depth,x,segments=24){const g=new THREE.CylinderGeometry(r,r,depth,segments);g.rotateZ(-Math.PI/2);g.translate(x,0,0);return g;}
function ribbon(points,widths,angle,edge=false){
 const p=[],uv=[],ix=[];
 for(let i=0;i<points.length;i++){
  const [r,a]=points[i],t=angle+a,front=.101+.049*Math.pow(r/.31,1.2),w=widths[i];
  const section=edge?[[front+.001,w*.79],[front+.001,w*.98]]:[[front,w*.76],[front-.005,w],[front-.024,w*.85],[front-.024,-w*.85],[front-.005,-w],[front,-w*.76]];
  for(const [x,offset]of section){p.push(x,Math.cos(t)*r-Math.sin(t)*offset,Math.sin(t)*r+Math.cos(t)*offset);uv.push(i/(points.length-1),offset/w);}
 }
 const n=edge?2:6;
 for(let i=0;i<points.length-1;i++)for(let j=0;j<(edge?1:n);j++){
  const a=i*n+j,b=i*n+(j+1)%n,c=(i+1)*n+j,d=(i+1)*n+(j+1)%n;ix.push(a,c,b,b,c,d);
 }
 if(!edge){for(let j=1;j<n-1;j++){ix.push(0,j,j+1);const o=(points.length-1)*n;ix.push(o,o+j+1,o+j);}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;
}
function tireBump(){
 const w=768,h=128,data=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const u=x/w,v=y/h,edge=v<.14||v>.86;
  const circum=[.29,.5,.71].some(c=>Math.abs(v-c)<.016);
  const diagonal=((u*36+(v<.5?v:-v)*1.15)%1+1)%1;
  const sipe=diagonal<.055&&v>.17&&v<.83;
  const grain=((x*17+y*37+x*y*3)%23)-11;
  const value=edge?175+grain*.28:circum||sipe?55:182+grain;
  const i=(y*w+x)*4;data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;
 }
 const t=new THREE.DataTexture(data,w,h);t.wrapS=THREE.RepeatWrapping;t.wrapT=THREE.ClampToEdgeWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;
}
function build(simple){
 const seg=simple?48:96,buckets=new Map(),colors={rubber:'#24262a',dark:'#171b21',alloy:'#6f7883',cut:'#c9d0d7',rotor:'#747d83',caliper:'#b91d16'};
 function add(kind,g,color){
  if(simple&&(kind==='cut'||kind==='rotor'))kind='alloy';
  if(g.index){const old=g;g=old.toNonIndexed();old.dispose();}
  if(!g.getAttribute('normal'))g.computeVertexNormals();
  const count=g.getAttribute('position').count;
  if(!g.getAttribute('uv'))g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(count*2),2));
  const c=new THREE.Color(color||colors[kind]),a=new Float32Array(count*3);for(let i=0;i<count;i++){a[i*3]=c.r;a[i*3+1]=c.g;a[i*3+2]=c.b;}
  g.setAttribute('color',new THREE.BufferAttribute(a,3));if(!buckets.has(kind))buckets.set(kind,[]);buckets.get(kind).push(g);
 }
 add('rubber',lathe([[-.137,.303],[-.138,.337],[-.127,.358],[-.094,.372],[-.065,.375],[.065,.375],[.094,.372],[.127,.358],[.138,.337],[.137,.303]],seg));
 add('dark',annulus(.132,.291,.309,.254,seg));
 add('cut',lathe([[.135,.299],[.148,.303],[.151,.310],[.145,.315],[.136,.313]],seg));
 add('alloy',annulus(-.128,.294,.31,.01,seg));
 // Fine raised sidewall moulding stays under the unchanged 0.375 m outer radius.
 for(const r of[.331,.349])add('rubber',lathe([[.137,r-.001],[.139,r],[.137,r+.001]],seg));
 if(!simple){
  for(let i=0;i<60;i++){
   const a=i*Math.PI*2/60,g=new THREE.BoxGeometry(.0015,.009,.0022);g.rotateX(a);g.translate(.137,Math.cos(a)*.343,Math.sin(a)*.343);add('rubber',g,'#323439');
  }
 }
 // Five sculpted Y spokes, each with a concave stem and two swept, bevelled branches.
 for(let i=0;i<5;i++){
  const a=i*Math.PI*2/5+.10;
  const paths=[{p:[[.048,0],[.105,.01],[.168,.015]],w:[.024,.029,.021]},{p:[[.128,.015],[.217,-.115],[.299,-.172]],w:[.019,.020,.022]},{p:[[.128,.015],[.219,.16],[.299,.21]],w:[.019,.018,.024]}];
  for(const [index,path]of paths.entries()){
   add('alloy',ribbon(path.p,path.w,a));
   if(!simple&&index>0){const start=[.17,index===1?-.046:.083];add('cut',ribbon([start,...path.p.slice(1)],[.020,...path.w.slice(1)],a,true));}
  }
 }
 add('rotor',annulus(.081,.073,.257,.016,seg));
 add('dark',disc(.094,.025,.084,simple?24:48));
 // Drilled recesses and concentric machining lines sit behind the open spokes.
 for(let i=0;i<(simple?12:30);i++){
  const a=i*Math.PI*2/(simple?12:30),r=i%2?.229:.201,g=disc(simple?.007:.0055,.0015,.082,simple?5:8);g.translate(0,Math.cos(a)*r,Math.sin(a)*r);add('dark',g,'#24272b');
 }
 if(!simple)for(const r of[.113,.145,.179,.249])add('rotor',annulus(.0822,r-.0006,r+.0006,.0003,seg),'#71797d');
 add('alloy',disc(.066,.038,.119,32));
 add('cut',annulus(.146,.038,.044,.006,32));
 add('dark',disc(.038,.013,.149,32));
 for(let i=0;i<5;i++){
  const a=i*Math.PI*2/5+.4,g=disc(.0095,.009,.146,6);g.translate(0,Math.cos(a)*.052,Math.sin(a)*.052);add('cut',g);
 }
 // Original V crest, deliberately not a real marque's badge.
 for(const side of[-1,1]){const g=new THREE.BoxGeometry(.0015,.028,.004);g.rotateX(side*.52);g.translate(.157,.001,side*.006);add('cut',g,'#d7b576');}
 // Fixed radial caliper shares steering, but is never parented under the rolling group.
 const caliper=new THREE.CapsuleGeometry(.034,.105,simple?2:4,simple?8:12);caliper.rotateX(.18);caliper.scale(.75,1,1.55);caliper.translate(.107,.025,-.221);add('caliper',caliper);
 const bridge=new THREE.BoxGeometry(.040,.100,.031,1,1,1);bridge.translate(.080,.025,-.245);add('caliper',bridge,'#77100d');
 for(const y of[-.022,.035,.081]){const g=new THREE.BoxGeometry(.004,.011,.058);g.translate(.134,y,-.219);add('caliper',g,'#da382a');}
 const geometries=new Map();let triangles=0;
 for(const[k,list]of buckets){const g=mergeGeometries(list,false);for(const part of list)part.dispose();g.computeBoundingBox();g.computeBoundingSphere();triangles+=g.attributes.position.count/3;geometries.set(k,g);}
 return {geometries,texture:simple?null:tireBump(),triangles,refs:0};
}

export function createWheelSet({simple=false}={}){
 const key=simple?'simple':'detailed';if(!pools.has(key))pools.set(key,build(simple));const pool=pools.get(key);pool.refs++;
 const materials=new Map();
 for(const kind of pool.geometries.keys()){
  const rubber=kind==='rubber',caliper=kind==='caliper',dark=kind==='dark';
  const m=new THREE.MeshStandardMaterial({vertexColors:true,metalness:rubber?0:caliper?.42:dark?.65:.92,roughness:rubber?.9:caliper?.31:dark?.4:kind==='cut'?.19:kind==='rotor'?.52:.29});
  m.name='Forged wheel '+kind;m.envMapIntensity=kind==='cut'?1.35:.95;
  if(rubber&&pool.texture){m.bumpMap=pool.texture;m.bumpScale=.0022;}
  materials.set(kind,m);
 }
 let disposed=false;
 return {
  trianglesPerWheel:pool.triangles,drawCallsPerWheel:materials.size,
  create(side=1){
   const root=new THREE.Group(),rotating=new THREE.Group(),fixed=new THREE.Group();root.name='Forged wheel assembly';rotating.name='Rotating tire rim and disc';fixed.name='Fixed brake caliper';root.add(rotating,fixed);
   for(const[k,g]of pool.geometries){const mesh=new THREE.Mesh(g,materials.get(k));mesh.name=k;mesh.scale.x=side;mesh.castShadow=true;mesh.receiveShadow=true;(k==='caliper'?fixed:rotating).add(mesh);}
   return {root,rotating,fixed};
  },
  setInterior(inside){for(const m of materials.values()){m.colorWrite=!inside;m.depthWrite=!inside;}},
  dispose(){if(disposed)return;disposed=true;for(const m of materials.values())m.dispose();if(--pool.refs===0){for(const g of pool.geometries.values())g.dispose();pool.texture?.dispose();pools.delete(key);}}
 };
}
