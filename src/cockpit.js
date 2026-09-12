import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Local +Z points through the windscreen; every instrument face points back at the driver.
// The cabin is independent of the exterior materials hidden by car.setInterior().
export function createCockpit({simple=false}={}) {
 const root=new THREE.Group(),steeringWheel=new THREE.Group();
 root.name='GT cockpit';root.visible=false;root.add(steeringWheel);
 steeringWheel.position.set(.35,.78,.17);
 if(simple)return {root,steeringWheel,update(){},dispose(){}};
 // A short-range cabin bounce opens front-facing leather without lighting the road.
 const cabinBounce=new THREE.PointLight('#e5e5dd',.32,1.8,2);cabinBounce.position.set(.20,1.13,-.34);root.add(cabinBounce);
 const geometries=new Set(),materials=new Set(),textures=new Set(),batches=new Map();
 const material=(options)=>{const m=new THREE.MeshStandardMaterial(options);materials.add(m);return m;};
 const basic=(options)=>{const m=new THREE.MeshBasicMaterial(options);materials.add(m);return m;};
 const grainCanvas=document.createElement('canvas');grainCanvas.width=grainCanvas.height=128;
 const grainCtx=grainCanvas.getContext('2d'),grain=grainCtx.createImageData(128,128);let seed=913;
 for(let i=0;i<grain.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const n=110+(seed>>>26);grain.data[i]=grain.data[i+1]=grain.data[i+2]=n;grain.data[i+3]=255;}
 grainCtx.putImageData(grain,0,0);
 const leatherGrain=new THREE.CanvasTexture(grainCanvas);leatherGrain.wrapS=leatherGrain.wrapT=THREE.RepeatWrapping;leatherGrain.repeat.set(18,10);textures.add(leatherGrain);
 const leather=material({color:'#77766f',roughness:.92,metalness:.02,bumpMap:leatherGrain,bumpScale:.00045,envMapIntensity:.32,emissive:'#121a1c',emissiveIntensity:.24});
 const rimLeather=material({color:'#414a4c',roughness:.82,bumpMap:leatherGrain,bumpScale:.00035,envMapIntensity:.38,emissive:'#394346',emissiveIntensity:.20});
 const lower=material({color:'#3b4545',roughness:.88,envMapIntensity:.3,emissive:'#141c21',emissiveIntensity:.20});
 const insert=material({color:'#252d2e',roughness:.66,metalness:.08,envMapIntensity:.40,emissive:'#273235',emissiveIntensity:.15});
 const satin=material({color:'#a9afac',roughness:.39,metalness:.64,envMapIntensity:.68});
 const graphite=material({color:'#697577',roughness:.43,metalness:.44,envMapIntensity:.55});
 const ventBlack=material({color:'#050a0d',roughness:.96,envMapIntensity:.12});
 const warm=basic({color:'#ee975c',toneMapped:false});
 const softWarm=basic({color:'#a97752',toneMapped:false});
 const stitchMat=new THREE.LineBasicMaterial({color:'#968877',transparent:true,opacity:.65});materials.add(stitchMat);
 function add(g,m,pos=[0,0,0],rot=[0,0,0],parent=root){
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...pos),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),new THREE.Vector3(1,1,1));g.applyMatrix4(matrix);
  let map=batches.get(parent);if(!map){map=new Map();batches.set(parent,map);}if(!map.has(m))map.set(m,[]);map.get(m).push(g);return g;
 }
 function box(size,pos,m=leather,r=.012,rot=[0,0,0],parent=root){const edge=Math.min(...size),g=edge<=.006?new THREE.BoxGeometry(...size):new RoundedBoxGeometry(...size,edge<.018?1:2,Math.min(r,edge*.45));return add(g,m,pos,rot,parent);}
 function tube(points,r,m=graphite,parent=root,closed=false,segments=64,capEnds=false){
  const c=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),closed,'catmullrom',.35),radial=6,g=new THREE.TubeGeometry(c,segments,r,radial,closed);add(g,m,[0,0,0],[0,0,0],parent);
  if(capEnds&&!closed)for(const end of[0,segments]){
   const t=end/segments,center=c.getPointAt(t),normal=c.getTangentAt(t).multiplyScalar(end===0?-1:1),positions=center.toArray(),normals=normal.toArray(),uv=[.5,.5],indices=[];
   for(let j=0;j<radial;j++){positions.push(g.attributes.position.getX(end*(radial+1)+j),g.attributes.position.getY(end*(radial+1)+j),g.attributes.position.getZ(end*(radial+1)+j));normals.push(...normal.toArray());uv.push(.5+.5*Math.cos(j/radial*Math.PI*2),.5+.5*Math.sin(j/radial*Math.PI*2));}
   for(let j=0;j<radial;j++){const a=j+1,b=(j+1)%radial+1,pa=new THREE.Vector3().fromArray(positions,a*3).sub(center),pb=new THREE.Vector3().fromArray(positions,b*3).sub(center);indices.push(...(pa.cross(pb).dot(normal)>=0?[0,a,b]:[0,b,a]));}
   const cap=new THREE.BufferGeometry();cap.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));cap.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));cap.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));cap.setIndex(indices);add(cap,m,[0,0,0],[0,0,0],parent);
  }
  return c;
 }
 function line(points,m=stitchMat,parent=root){const g=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));geometries.add(g);const mesh=new THREE.Line(g,m);parent.add(mesh);return mesh;}
 function shapePart(points,depth,pos,m,parent=root){const shape=new THREE.Shape();shape.moveTo(...points[0]);for(const p of points.slice(1))shape.lineTo(...p);shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:true,bevelThickness:.002,bevelSize:.002,bevelSegments:2});add(g,m,pos,[0,0,0],parent);}
 function cylinder(r,h,pos,m=satin,parent=root,segments=32){add(new THREE.CylinderGeometry(r,r,h,segments),m,pos,[Math.PI/2,0,0],parent);}
 function ring(rx,ry,pos,m=satin,parent=root,r=.0025){const pts=[];for(let i=0;i<48;i++){const a=i/48*Math.PI*2;pts.push([pos[0]+Math.cos(a)*rx,pos[1]+Math.sin(a)*ry,pos[2]]);}return tube(pts,r,m,parent,true,64);}
 // A continuous padded dash rolls from the windscreen shelf into the lower fascia.
 const profile=new THREE.CatmullRomCurve3([[1.20,.805],[1.045,.834],[.83,.822],[.635,.766],[.601,.686],[.676,.582],[.94,.567],[1.20,.66]].map(([z,y])=>new THREE.Vector3(0,y,z)),true,'catmullrom',.28);
 const rows=24,cols=48,positions=[],uv=[],indices=[];
 for(let i=0;i<=rows;i++){
  const x=(i/rows-.5)*1.69,lift=.013*(1-(x/.845)**2),forward=.055*(Math.abs(x)/.845)**3;
  for(let j=0;j<cols;j++){const p=profile.getPoint(j/cols);positions.push(x,p.y+lift,p.z+forward);uv.push(i/rows,j/cols);}
 }
 for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const a=i*cols+j,b=i*cols+(j+1)%cols,c=a+cols,d=b+cols;indices.push(a,c,b,b,c,d);}
 for(const end of[0,rows]){const c=positions.length/3;positions.push((end/rows-.5)*1.69,.72,.9);uv.push(.5,.5);for(let j=0;j<cols;j++){const a=end*cols+j,b=end*cols+(j+1)%cols;if(end===0)indices.push(c,a,b);else indices.push(c,b,a);}}
 const shell=new THREE.BufferGeometry();shell.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));shell.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));shell.setIndex(indices);shell.computeVertexNormals();add(shell,leather);
 // The seam, satin reveal and ambient strip follow the fascia instead of floating above it.
 for(const zOffset of[0,.009]){
  const z=.927+zOffset;let surface=profile.getPoint(0);for(let i=1;i<=160;i++){const p=profile.getPoint(i/500);if(Math.abs(p.z-z)<Math.abs(surface.z-z))surface=p;}
  const seam=[];for(let i=0;i<=80;i++){const x=(i/80-.5)*1.60;seam.push([x,surface.y+.013*(1-(x/.845)**2)+.0012,z+.055*(Math.abs(x)/.845)**3]);}line(seam);
 }
 const reveal=[];for(let i=0;i<=44;i++){const x=(i/44-.5)*1.64;reveal.push([x,.670+.014*(1-(x/.845)**2),.603+.055*(Math.abs(x)/.845)**3]);}
 tube(reveal,.0043,graphite);tube(reveal.map(([x,y,z])=>[x,y-.008,z-.002]),.0015,softWarm);
 box([1.50,.080,.11],[0,.580,.648],lower,.022);
 // Instrument binnacle: a shallow hood is sunk into the upholstered fascia.
 box([.414,.128,.145],[.35,.793,.638],rimLeather,.043);
 box([.388,.106,.017],[.35,.790,.557],graphite,.027);
 box([.377,.098,.010],[.35,.790,.545],ventBlack,.024);
 const gaugeCanvas=document.createElement('canvas');gaugeCanvas.width=1024;gaugeCanvas.height=272;
 const gaugeCtx=gaugeCanvas.getContext('2d'),gaugeTexture=new THREE.CanvasTexture(gaugeCanvas);gaugeTexture.colorSpace=THREE.SRGBColorSpace;gaugeTexture.anisotropy=2;textures.add(gaugeTexture);
 const gaugeMaterial=basic({map:gaugeTexture,toneMapped:false});
 add(new THREE.PlaneGeometry(.362,.092),gaugeMaterial,[.35,.790,.538],[0,Math.PI,0]);
 // Fine labels share one atlas and one material, even on the rotating wheel.
 const labelCanvas=document.createElement('canvas');labelCanvas.width=labelCanvas.height=512;
 const labelCtx=labelCanvas.getContext('2d'),labels=['+','−','MODE','SET','◀','▶','AUTO','SYNC','V','P','R','N','D','START','21°','GT'];
 labelCtx.clearRect(0,0,512,512);labelCtx.textAlign='center';labelCtx.textBaseline='middle';labelCtx.fillStyle='#d7dedb';
 labels.forEach((s,i)=>{labelCtx.font=`${s.length<2?'600 74':'500 32'}px Arial`;labelCtx.fillText(s,i%4*128+64,Math.floor(i/4)*128+65);});
 const labelTexture=new THREE.CanvasTexture(labelCanvas);labelTexture.colorSpace=THREE.SRGBColorSpace;textures.add(labelTexture);
 const labelMat=basic({map:labelTexture,transparent:true,alphaTest:.1,depthWrite:false,toneMapped:false});
 function label(text,pos,w=.020,h=.012,parent=root){const n=labels.indexOf(text),g=new THREE.PlaneGeometry(w,h),a=g.attributes.uv;for(let i=0;i<a.count;i++)a.setXY(i,(n%4+a.getX(i))/4,(3-Math.floor(n/4)+a.getY(i))/4);add(g,labelMat,pos,[0,Math.PI,0],parent);}
 // Four recessed vents, each with a satin perimeter and five actual louvres.
 function vent(x,y,z,width=.15){box([width+.012,.058,.046],[x,y,z+.015],graphite,.024);box([width,.046,.014],[x,y,z-.010],ventBlack,.020);ring(width*.47,.022,[x,y,z-.019],satin,root,.0016);for(let j=-2;j<=2;j++)box([width*.81,.0025,.018],[x,y+j*.0065,z-.020],graphite,.001,[.16,0,0]);box([.013,.010,.012],[x+.018,y,z-.034],satin,.003);}
 vent(-.238,.735,.622,.153);vent(-.040,.735,.606,.153);vent(-.737,.738,.670,.113);vent(.745,.739,.670,.102);
 // A descending center stack with a real inset switch panel and raised side rails.
 box([.31,.28,.17],[-.11,.557,.532],lower,.034,[.24,0,0]);
 box([.274,.175,.027],[-.11,.594,.428],insert,.023,[.24,0,0]);
 for(const side of[-1,1])tube([[side*.144-.11,.672,.452],[side*.144-.11,.582,.430],[side*.138-.11,.485,.340],[side*.115-.11,.432,.04]],.004,satin);
 box([.305,.105,.70],[-.07,.424,.075],lower,.035);
 box([.266,.010,.58],[-.07,.481,.068],insert,.023);
 for(const x of[-.211,-.012]){
  cylinder(.026,.026,[x,.618,.409],satin);cylinder(.021,.031,[x,.618,.393],insert);
  for(let i=0;i<26;i++){const a=i/26*Math.PI*2;box([.0017,.0040,.011],[x+Math.cos(a)*.0245,.618+Math.sin(a)*.0245,.400],graphite,.0006,[0,0,a]);}
  tube([[x,.635,.374],[x,.641,.374]],.001,warm,root,false,2);
 }
 box([.106,.030,.013],[-.111,.622,.409],ventBlack,.008);label('21°',[-.111,.622,.401],.071,.022);
 for(const [i,x]of[-.205,-.158,-.111,-.064,-.017].entries()){box([.034,.014,.024],[x,.561,.406],graphite,.004,[.15,0,0]);box([.018,.0017,.002],[x,.564,.393],i===2?warm:satin,.0006);}
 label('AUTO',[-.183,.586,.409],.032,.010);label('SYNC',[-.041,.586,.409],.032,.010);
 // Short selector and a knurled drive-mode dial sit on the console, below the sightline.
 box([.074,.012,.108],[-.068,.493,.224],graphite,.018);
 box([.037,.080,.056],[-.068,.536,.221],satin,.012,[-.15,0,0]);
 box([.060,.047,.074],[-.068,.583,.211],rimLeather,.014,[-.15,0,0]);
 tube([[-.091,.600,.181],[-.068,.606,.178],[-.045,.600,.181]],.0014,softWarm);
 add(new THREE.CylinderGeometry(.036,.038,.018,40),graphite,[-.068,.499,.016]);
 add(new THREE.CylinderGeometry(.029,.029,.020,40),insert,[-.068,.506,.016]);
 for(let i=0;i<30;i++){const a=i/30*Math.PI*2;box([.002,.009,.003],[-.068+Math.cos(a)*.036,.504,.016+Math.sin(a)*.036],satin,.0005,[0,-a,0]);}
 box([.096,.008,.047],[-.068,.487,-.100],rimLeather,.010);
 // The side shell stays opaque when car.setInterior() hides the exterior body.
 // Its sill intersects cabin-floor at y=.23; the fixed front section reaches the dash end cap.
 const canopyProfiles=[[-1.65,.79,.85,0],[-1.35,.80,.85,.16],[-.90,.79,.85,.37],[-.55,.78,.85,.43],[-.10,.78,.85,.43],[.22,.79,.85,.36],[.55,.81,.83,.20],[.93,.82,.80,0]];
 function canopyPoint(z,u,offset=0){
  let a=canopyProfiles[0],b=a,t=0;
  if(z>=canopyProfiles.at(-1)[0])a=b=canopyProfiles.at(-1);
  else if(z>a[0])for(let i=0;i<canopyProfiles.length-1;i++)if(z>=canopyProfiles[i][0]&&z<=canopyProfiles[i+1][0]){a=canopyProfiles[i];b=canopyProfiles[i+1];t=(z-a[0])/(b[0]-a[0]);break;}
  const w=THREE.MathUtils.lerp(a[1],b[1],t),base=THREE.MathUtils.lerp(a[2],b[2],t),height=THREE.MathUtils.lerp(a[3],b[3],t);
  return [w*u,base+height*Math.max(0,1-u*u)**.42+offset,z];
 }
 const windowUpper=z=>.73+.20*Math.abs(2*(z+1.32)/2.07-1)**2;
 const beltHeight=z=>canopyPoint(z,.985,-.017)[1];
 const doorShoulder=z=>beltHeight(z)-.047*THREE.MathUtils.smoothstep(z,.22,.55)*(1-THREE.MathUtils.smoothstep(z,.66,.94));
 // A closed solid loft gives every inner face the correct FrontSide winding.
 function solidLoft(source,chooseMaterial=()=>lower){
  const rings=source.map(r=>r.map(p=>p.slice())),n=rings[0].length;
  const area=rings[0].reduce((sum,p,j)=>{const q=rings[0][(j+1)%n];return sum+p[0]*q[1]-q[0]*p[1];},0);
  if(area<0)for(const ring of rings)ring.reverse();
  const pos=[],tex=[],all=[],faces=new Map();
  const face=(indices,mat)=>{all.push(...indices);if(!faces.has(mat))faces.set(mat,[]);faces.get(mat).push(...indices);};
  for(let i=0;i<rings.length;i++)for(let j=0;j<n;j++){pos.push(...rings[i][j]);tex.push(j/n,i/(rings.length-1));}
  for(let i=0;i<rings.length-1;i++)for(let j=0;j<n;j++){
   const a=i*n+j,b=i*n+(j+1)%n,c=a+n,d=b+n,p=rings[i][j],q=rings[i][(j+1)%n];
   face([a,b,c,b,d,c],chooseMaterial([(p[0]+q[0])/2,(p[1]+q[1])/2,(p[2]+q[2])/2]));
  }
  for(const row of[0,rings.length-1])for(const tri of THREE.ShapeUtils.triangulateShape(rings[row].map(p=>new THREE.Vector2(p[0],p[1])),[])){
   const a=rings[row][tri[0]],b=rings[row][tri[1]],c=rings[row][tri[2]],normal=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
   const t=tri.map(i=>row*n+i);if((row===0&&normal>0)||(row>0&&normal<0))[t[1],t[2]]=[t[2],t[1]];face(t,lower);
  }
  const complete=new THREE.BufferGeometry();complete.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));complete.setAttribute('uv',new THREE.Float32BufferAttribute(tex,2));complete.setIndex(all);complete.computeVertexNormals();
  for(const [m,index]of faces){const part=complete.clone();part.setIndex(index);add(part,m);}complete.dispose();
 }
 // The headliner follows the coupe canopy. Its front header remains behind the windscreen
 // so the original driving sightline stays open; the side rails meet both A-pillars exactly.
 const roofRings=[];
 for(let i=0;i<=32;i++){
  const z=-1.32+1.205*i/32,u=windowUpper(z),inside=[],outside=[];
  for(let j=0;j<=24;j++){const across=u*(j/12-1);inside.push(canopyPoint(z,across,-.029));outside.unshift(canopyPoint(z,across,-.004));}
  roofRings.push([...inside,...outside]);
 }
 solidLoft(roofRings);
 const header=[];for(let j=0;j<=32;j++)header.push(canopyPoint(-.115,windowUpper(-.115)*(j/16-1),-.031));tube(header,.009,rimLeather,root,false,40);
 for(const side of[-1,1]){
  const rings=[];
  for(let i=0;i<=42;i++){
   const z=-1.32+2.56*i/42,top=doorShoulder(z),front=THREE.MathUtils.smoothstep(z,.53,.88),rear=1-THREE.MathUtils.smoothstep(z,-1.30,-1.07),fixed=Math.max(front,rear);
   const contour=[[.816,.23],[.800,.35],[.790,.50],[.800,top-(.165-.075*THREE.MathUtils.smoothstep(z,.15,.65))],[.811,top-.085],[.798,top-.046],[.790,top-.008],[.803,top+.003],[.861,top-.014],[.876,top-.083],[.884,.40],[.851,.23]];
   const cross=new THREE.CatmullRomCurve3(contour.map(([x,y],j)=>new THREE.Vector3(side*(j<8?THREE.MathUtils.lerp(x,j===0?.816:.819,fixed):x),y,z)),true,'catmullrom',.25);
   const ring=[];for(let j=0;j<48;j++)ring.push(cross.getPoint(j/48).toArray());rings.push(ring);
  }
  solidLoft(rings,p=>p[1]>doorShoulder(p[2])-(.165-.075*THREE.MathUtils.smoothstep(p[2],.15,.65))&&p[2]<.76?leather:lower);
  // A short fixed sail panel closes the lowered door shoulder beneath the A-pillar.
  // It sits behind the leather card and keeps the original glass aperture unchanged.
  const sail=[];for(let i=0;i<=16;i++){const z=.22+.73*i/16,lo=doorShoulder(z)-.026,hi=beltHeight(z)-.002;sail.push([[side*.820,lo,z],[side*.820,hi,z],[side*.871,hi,z],[side*.871,lo,z]]);}solidLoft(sail,()=>rimLeather);
  // A continuous rubber belt seal sits on the rolled leather shoulder, never in mid-air.
  const seal=[],ambient=[],seam=[];
  for(let i=0;i<=42;i++){
   const z=-1.30+2.22*i/42,fixed=Math.max(THREE.MathUtils.smoothstep(z,.53,.88),1-THREE.MathUtils.smoothstep(z,-1.30,-1.07)),sailMix=THREE.MathUtils.smoothstep(z,.22,.44)*(1-THREE.MathUtils.smoothstep(z,.85,.96)),x=THREE.MathUtils.lerp(THREE.MathUtils.lerp(.803,.819,fixed),.821,sailMix),top=doorShoulder(z);
   seal.push([side*x,beltHeight(z)+.002,z]);
   if(z<.52&&z> -1.06){ambient.push([side*.796,top-.070,z]);seam.push([side*.796,top-.033,z]);}
  }
  tube(seal,.0048,ventBlack,root,false,58);tube(ambient,.0013,softWarm,root,false,34);line(seam);
  // This armrest is buried 5 cm into the side shell, with a deep pad and anchored pull.
  box([.130,.083,.72],[side*(.741+.048),.615,-.330],rimLeather,.025);
  box([.098,.014,.61],[side*(.730+.048),.661,-.342],leather,.006);
  for(const z of[-.490,-.090])box([.053,.060,.050],[side*(.750+.048),.698,z],insert,.010);
  tube([[side*(.750+.048),.716,-.490],[side*(.702+.048),.716,-.395],[side*(.700+.048),.716,-.182],[side*(.751+.048),.720,-.090]],.0105,satin,root,false,36);
  for(const z of[-.42,-.33])box([.025,.008,.047],[side*(.702+.048),.674,z],graphite,.003);
  box([.023,.059,.172],[side*(.752+.048),.754,.150],insert,.011);
  tube([[side*(.737+.048),.762,.091],[side*(.729+.048),.762,.178],[side*(.749+.048),.748,.205]],.0055,satin,root,false,18);
  const padStitch=[];for(let i=0;i<=18;i++)padStitch.push([side*(.686+.048),.646,-.632+.584*i/18]);line(padStitch);
  // A shallow pocket and recessed grille make the lower door read as one molded card.
  box([.076,.076,.48],[side*(.762+.048),.415,-.303],rimLeather,.018);
  box([.063,.009,.410],[side*(.753+.048),.453,-.303],ventBlack,.003);
  add(new THREE.CylinderGeometry(.082,.082,.014,36),insert,[side*(.750+.038),.448,.280],[0,0,Math.PI/2]);
  const grille=[];for(let j=0;j<40;j++){const a=j/40*Math.PI*2;grille.push([side*(.740+.038),.448+Math.sin(a)*.083,.280+Math.cos(a)*.083]);}tube(grille,.002,graphite,root,true,48);
  for(let j=-8;j<=8;j++){const y=j*.0084,zWidth=2*Math.sqrt(Math.max(0,.076**2-y*y));box([.002,.0018,zWidth],[side*(.740+.038),.448+y,.280],graphite,.0005);}
  // Side window rails follow the exported glass boundary; the rear jamb closes on the belt.
  const rail=[];for(let i=0;i<=34;i++){const z=-1.32+1.205*i/34;rail.push(canopyPoint(z,side*windowUpper(z),-.024));}tube(rail,.016,rimLeather,root,false,44);
  const upper=canopyPoint(-.115,side*windowUpper(-.115),-.024),foot=canopyPoint(.93,side*.985,-.008),middle=canopyPoint(.34,side*.84,-.020);
  const extendedTop=new THREE.Vector3(...upper).add(new THREE.Vector3(...upper).sub(new THREE.Vector3(...middle)).normalize().multiplyScalar(.035)).add(new THREE.Vector3(0,.05,0)).toArray();
  const extendedFoot=new THREE.Vector3(...foot).add(new THREE.Vector3(...foot).sub(new THREE.Vector3(...middle)).normalize().multiplyScalar(.018)).toArray();
  const aPillar=[extendedTop,middle,extendedFoot];
  // End caps reuse the actual six-sided tube rings; the header end is buried in the roof.
  tube(aPillar,.0215,rimLeather,root,false,40,true);
  tube(aPillar.map(([x,y,z])=>[x-side*.013,y-.001,z]),.0035,ventBlack,root,false,40);
  const rearTop=canopyPoint(-1.32,side*windowUpper(-1.32),-.024),rearBottom=[side*.819,beltHeight(-1.32),-1.32];tube([rearBottom,rearTop],.018,rimLeather,root,false,6,true);
  // Fixed kick trim joins the A-pillar foot and the dashboard's closed outer end.
  tube([foot,[side*.817,.797,1.055],[side*.838,.801,1.205]],.015,leather,root,false,22);
 }
 // Compact D rim with sculpted thumb grips, satin spokes, tactile keys and paddles.
 const rimCurve=tube([[0,.155,0],[.080,.136,0],[.136,.083,0],[.154,.01,0],[.139,-.065,0],[.098,-.119,0],[0,-.132,0],[-.098,-.119,0],[-.139,-.065,0],[-.154,.01,0],[-.136,.083,0],[-.080,.136,0]],.0165,rimLeather,steeringWheel,true,112);
 const wheelStitches=[];
 for(let i=0;i<92;i++){const p=rimCurve.getPoint(i/92),p2=rimCurve.getPoint((i+.35)/92);wheelStitches.push(new THREE.Vector3(p.x*.995,p.y*.995,-.0158),new THREE.Vector3(p2.x*.995,p2.y*.995,-.0158));}
 const stitchGeo=new THREE.BufferGeometry().setFromPoints(wheelStitches);geometries.add(stitchGeo);steeringWheel.add(new THREE.LineSegments(stitchGeo,stitchMat));
 for(const side of[-1,1]){
  box([.032,.060,.030],[side*.137,.046,-.004],rimLeather,.012,[0,0,-side*.18],steeringWheel);
  const spoke=[[.026,.022],[.115,.040],[.134,.005],[.083,-.020],[.028,-.021]].map(([x,y])=>[x*side,y]);if(side<0)spoke.reverse();shapePart(spoke,.011,[0,0,-.005],satin,steeringWheel);
  const inset=[[.045,.016],[.111,.028],[.115,.007],[.075,-.008],[.043,-.009]].map(([x,y])=>[x*side,y]);if(side<0)inset.reverse();shapePart(inset,.004,[0,0,-.011],insert,steeringWheel);
  for(const [i,x]of[.063,.094].entries()){box([.020,.016,.007],[side*x,.010,-.019],graphite,.005,[0,0,side*.08],steeringWheel);label(i===0?(side>0?'MODE':'SET'):(side>0?'▶':'◀'),[side*x,.010,-.023],.020,.012,steeringWheel);}
  box([.022,.099,.012],[side*.122,.021,.050],graphite,.009,[0,0,-side*.10],steeringWheel);
  box([.016,.043,.004],[side*.122,.045,.042],satin,.006,[0,0,-side*.10],steeringWheel);label(side>0?'−':'+',[side*.123,.045,.039],.017,.021,steeringWheel);
 }
 shapePart([[-.030,-.020],[.030,-.020],[.044,-.117],[.018,-.124],[-.018,-.124],[-.044,-.117]],.012,[0,0,-.003],satin,steeringWheel);
 shapePart([[-.020,-.034],[.020,-.034],[.026,-.109],[-.026,-.109]],.008,[0,0,-.012],insert,steeringWheel);
 box([.091,.073,.042],[0,0,-.018],rimLeather,.025,[0,0,0],steeringWheel);
 // An original two-stroke V is physical satin metal on the airbag cover.
 tube([[-.012,.011,-.042],[0,-.010,-.044],[.012,.011,-.042]],.0019,satin,steeringWheel,false,12);
 tube([[-.009,.012,-.042],[0,-.003,-.044],[.009,.012,-.042]],.0010,graphite,steeringWheel,false,12);
 ring(.009,.0025,[0,.152,-.0138],softWarm,steeringWheel,.0013);
 box([.024,.008,.004],[0,-.111,-.021],graphite,.003,[0,0,0],steeringWheel);label('GT',[0,-.111,-.024],.021,.008,steeringWheel);
 for(const [parent,map]of batches)for(const [m,list]of map){const ready=list.map(g=>{const n=g.index?g.toNonIndexed():g;if(n!==g)g.dispose();for(const key of Object.keys(n.attributes))if(!['position','normal','uv'].includes(key))n.deleteAttribute(key);return n;});const geometry=mergeGeometries(ready,false);for(const g of ready)g.dispose();if(!geometry)throw new Error('Cockpit geometry merge failed');geometry.computeBoundingSphere();geometries.add(geometry);const mesh=new THREE.Mesh(geometry,m);mesh.castShadow=false;mesh.receiveShadow=false;parent.add(mesh);}
 let triangles=0;root.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;});
 root.userData.cockpit={triangles,geometries:geometries.size,materials:materials.size,instrumentTop:.857};
 let drawTime=1,lastKey='';
 function draw(p){
  const ctx=gaugeCtx,w=gaugeCanvas.width,h=gaugeCanvas.height,speed=Math.round(Math.abs(p.u||0)*3.6),rpm=Math.max(0,Math.min(1,(p.rpm||900)/8000)),gear=p.gear===-1?'R':p.gear===0?'N':String(p.gear||'N');
  ctx.fillStyle='#071115';ctx.fillRect(0,0,w,h);
  const glow=ctx.createLinearGradient(0,0,0,h);glow.addColorStop(0,'#15252a');glow.addColorStop(1,'#070e12');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
  ctx.lineWidth=2;ctx.strokeStyle='#526366';ctx.beginPath();ctx.moveTo(355,39);ctx.lineTo(355,224);ctx.moveTo(704,39);ctx.lineTo(704,224);ctx.stroke();
  const cx=179,cy=160,r=111,start=Math.PI*.82,end=Math.PI*2.18;
  ctx.lineWidth=10;ctx.strokeStyle='#2b3b40';ctx.beginPath();ctx.arc(cx,cy,r,start,end);ctx.stroke();
  ctx.strokeStyle='#f49b61';ctx.beginPath();ctx.arc(cx,cy,r,start,start+(end-start)*rpm);ctx.stroke();
  for(let i=0;i<=8;i++){const a=start+(end-start)*i/8;ctx.lineWidth=i>6?3:2;ctx.strokeStyle=i>6?'#d7774b':'#859493';ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*(r-10),cy+Math.sin(a)*(r-10));ctx.lineTo(cx+Math.cos(a)*(r-20),cy+Math.sin(a)*(r-20));ctx.stroke();ctx.font='20px Arial';ctx.textAlign='center';ctx.fillStyle='#a1afab';ctx.fillText(String(i),cx+Math.cos(a)*(r-36),cy+Math.sin(a)*(r-36)+7);}
  ctx.fillStyle='#e4ece7';ctx.font='500 42px Arial';ctx.textAlign='center';ctx.fillText(((p.rpm||900)/1000).toFixed(1),cx,157);ctx.font='16px Arial';ctx.fillStyle='#94a6a6';ctx.fillText('RPM × 1000',cx,181);
  ctx.fillStyle='#e9f0eb';ctx.font='500 128px Arial';ctx.fillText(String(speed),526,169);ctx.font='20px Arial';ctx.fillStyle='#afbfba';ctx.fillText('km/h',526,204);
  ctx.fillStyle='#ee975c';ctx.font='600 94px Arial';ctx.fillText(gear,817,163);ctx.fillStyle='#c8d3cd';ctx.font='16px Arial';ctx.fillText('GEAR',817,194);
  ctx.font='18px Arial';ctx.textAlign='left';ctx.fillStyle='#d7dfd9';ctx.fillText('SPORT',40,29);ctx.textAlign='right';ctx.fillStyle=p.boost?'#f49b61':'#8a9d9d';ctx.fillText(p.boost?'BOOST':'V E L O C I T Y',984,29);
  ctx.fillStyle='#425358';ctx.fillRect(915,73,7,115);ctx.fillStyle=p.boost?'#f6a065':'#73998e';ctx.fillRect(915,188-115*(p.nitro??100)/100,7,115*(p.nitro??100)/100);
  ctx.font='14px Arial';ctx.textAlign='center';ctx.fillStyle='#92a6a1';ctx.fillText('N₂O',920,211);
  ctx.fillStyle='#22363b';ctx.fillRect(38,241,948,2);ctx.fillStyle='#bacaC5';ctx.font='15px Arial';ctx.textAlign='left';ctx.fillText('GT  /  06',40,264);ctx.textAlign='right';ctx.fillText(`${Math.round(p.temperature||55)}°C     ◇     ${p.brake>.05?'BRAKE':'READY'}`,982,264);gaugeTexture.needsUpdate=true;
 }
 draw({u:0,rpm:900,gear:0,nitro:100});
 return {root,steeringWheel,update(p,dt){steeringWheel.rotation.z=-p.steer*5;if(!root.visible)return;drawTime+=dt;const key=[Math.round(Math.abs(p.u)*3.6),Math.round(p.rpm/80),p.gear,Math.round(p.nitro),p.boost,p.brake>.05,Math.round(p.temperature||55)].join('|');if(drawTime>=.05&&key!==lastKey){drawTime=0;lastKey=key;draw(p);}},dispose(){for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();}};
}
