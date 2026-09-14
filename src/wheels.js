import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
const pools=new Map();

// Normalized mesh contract: createCar scales axial width and rolling radius
// independently from the exported axle extras. 21 inches names the bead seat,
// not the outer flange. Shared geometry uses the mean front/rear tire radius.
export const GT_WHEEL_SPEC=Object.freeze({
 normalizedRadius:.375,normalizedWidth:.276,referenceRadius:.362075,
 beadSeatRadius:.2667/.362075*.375,flangeRadius:.2800/.362075*.375,
 front:Object.freeze({designation:'275/35 R21',radius:.36295,width:.275}),
 rear:Object.freeze({designation:'315/30 R21',radius:.3612,width:.315})
});

// Only exported axle empties are wheel anchors. GLTFLoader also normalizes
// body names such as "Wheel arch rolled lip" to "Wheel_arch_rolled_lip".
export function selectWheelAnchors(body){
 return ['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR'].map(name=>{
  const anchor=body.children.find(o=>o.name===name&&!o.isMesh);
  if(!anchor||!Number.isFinite(anchor.position.x)||Math.abs(anchor.position.x)<1e-6||Math.abs(anchor.scale.x*anchor.scale.y*anchor.scale.z)<1e-9)throw new Error(`Invalid vehicle axle anchor: ${name}`);
  return anchor;
 });
}


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
  const [r,a]=points[i],t=angle+a,front=.116+.017*Math.pow(r/.29,1.3),w=widths[i];
  const section=edge?[[front+.001,w*.79],[front+.001,w*.98]]:[[front,w*.76],[front-.005,w],[front-.018,w*.85],[front-.018,-w*.85],[front-.005,-w],[front,-w*.76]];
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
 // Rounded shoulders and a convex sidewall. The tread is broad; the
 // flange partly overlaps the bead, as a real mounted tire does.
 const seat=GT_WHEEL_SPEC.beadSeatRadius,flange=GT_WHEEL_SPEC.flangeRadius;
 const shoulder=[[-.121,seat-.003],[-.128,.292],[-.134,.309],[-.138,.328],
  [-.136,.342],[-.128,.356],[-.114,.367],[-.094,.373]];
 const crown=x=>.375-.002*Math.pow(Math.abs(x)/.094,4);
 const tread=[[-.094,crown(-.094)]];
 // Four physically recessed drainage channels read at close range without
 // inflating bump strength or stamping tread across the sidewalls.
 for(const c of[-.073,-.026,.026,.073])for(const [dx,depth]of[[-.0035,0],[-.002,.003],[.002,.003],[.0035,0]])
  tread.push([c+dx,crown(c+dx)-depth]);
 tread.splice(9,0,[0,.375]);tread.push([.094,crown(.094)]);
 add('rubber',lathe([...shoulder.slice(0,-1),...tread,...shoulder.slice(0,-1).reverse().map(([x,r])=>[-x,r])],seg));
 // A closed barrel with a recessed well and radiused outer flange.
 add('dark',lathe([[-.124,.270],[-.124,seat],[-.103,seat],[-.091,.266],
  [.080,.266],[.103,seat],[.124,seat],[.124,.270],[-.124,.270]],seg));
 for(const side of[-1,1]){const profile=[
  [side*.117,seat-.003],[side*.127,seat],[side*.131,flange-.002],
  [side*.129,flange],[side*.124,flange+.0003],[side*.119,flange-.003],
  [side*.117,seat-.003]
 ];add('alloy',lathe(side<0?profile.reverse():profile,seg));}
 add('cut',lathe([[.129,flange-.004],[.130,flange-.002],[.1285,flange]],seg));
 // Subtle bead-protection and mould lines follow the rounded sidewall.
 for(const side of[-1,1])for(const [r,x]of[[.301,.132],[.345,.135]])
  add('rubber',lathe([[side*x,r-.0006],[side*(x+.0006),r],[side*x,r+.0006]],seg));
 // Five paired curved spokes: dense longitudinal stations avoid the former
 // angular, three-station star silhouette. Face highlights remain narrow.
 for(let i=0;i<5;i++)for(const branch of[-1,1]){
  const points=[],widths=[];
  for(let j=0;j<=12;j++){
   const t=j/12,r=.048+(.276-.048)*t;
   const spread=branch*(.028+.105*t*t*(3-2*t));
   points.push([r,spread+.035*Math.sin(Math.PI*t)]);
   widths.push(.008+.004*Math.sin(Math.PI*t)+.002*t);
  }
  const angle=i*Math.PI*2/5+.10;
  add('alloy',ribbon(points,widths,angle));
  if(!simple)add('cut',ribbon(points,widths,angle,true));
 }
 // 405 mm nominal rotor inside a 21-inch bead seat, independently dimensioned.
 const rotor=.2025/GT_WHEEL_SPEC.referenceRadius*.375;
 add('rotor',annulus(.074,.076,rotor,.016,seg));
 add('dark',disc(.094,.025,.069,simple?24:48));
 for(let i=0;i<(simple?12:30);i++){
  const a=i*Math.PI*2/(simple?12:30),r=i%2?rotor-.014:rotor-.032;
  const g=disc(simple?.0045:.003,.001,.0748,simple?5:8);
  g.translate(0,Math.cos(a)*r,Math.sin(a)*r);add('dark',g,'#24272b');
 }
 if(!simple)for(const r of[.111,.143,.179,rotor-.005])
  add('rotor',annulus(.0742,r-.0004,r+.0004,.0003,seg),'#71797d');
 add('alloy',disc(.066,.032,.115,32));
 add('cut',annulus(.134,.037,.042,.004,32));
 add('dark',disc(.037,.009,.135,32));
 for(let i=0;i<5;i++){
  const a=i*Math.PI*2/5+.4,g=disc(.008,.007,.135,6);
  g.translate(0,Math.cos(a)*.052,Math.sin(a)*.052);add('cut',g);
 }
 for(const side of[-1,1]){
  const g=new THREE.BoxGeometry(.0015,.024,.0035);g.rotateX(side*.52);
  g.translate(.142,.001,side*.006);add('cut',g,'#d7b576');
 }
 // Caliper embraces the rotor but ends before every rotating spoke back.
 const caliper=new THREE.CapsuleGeometry(.026,.085,simple?2:4,simple?8:12);
 caliper.rotateX(.18);caliper.scale(.69,1,1.1);
 caliper.translate(.071,.018,-.191);add('caliper',caliper);
 const bridge=new THREE.BoxGeometry(.037,.086,.024);
 bridge.translate(.068,.018,-.208);add('caliper',bridge,'#77100d');
 for(const y of[-.021,.018,.057]){
  const g=new THREE.BoxGeometry(.003,.008,.038);
  g.translate(.089,y,-.190);add('caliper',g,'#da382a');
 }
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
  if(rubber&&pool.texture){m.bumpMap=pool.texture;m.bumpScale=.00085;}
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
