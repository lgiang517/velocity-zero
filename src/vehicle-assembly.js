import * as THREE from 'three';

const point=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const chain=p=>Array.isArray(p)&&p.length>=2&&p.every(point);
const scaled=(p,s)=>new THREE.Vector3(...p).multiply(s).toArray();
export function sampleAssemblyChain(points,x){
 const ordered=points[0][0]<=points.at(-1)[0]?points:[...points].reverse();
 if(x<=ordered[0][0])return new THREE.Vector3(...ordered[0]).setX(x);
 if(x>=ordered.at(-1)[0])return new THREE.Vector3(...ordered.at(-1)).setX(x);
 for(let i=1;i<ordered.length;i++)if(x<=ordered[i][0])return new THREE.Vector3(...ordered[i-1]).lerp(new THREE.Vector3(...ordered[i]),(x-ordered[i-1][0])/(ordered[i][0]-ordered[i-1][0]));
}
const transverse=(width,z,edge,crown)=>Array.from({length:33},(_,i)=>{const u=i/16-1;return[u*width,edge+crown*(1-u*u),z];});
/** Extras are in unscaled game XYZ. Never derive the cockpit eye from model data. */
export function readVehicleAssembly(body,{scale=body.scale}={}){
 const source=body.getObjectByName('Vehicle_assembly')?.userData?.vehicleAssembly,s=scale.clone();
 const valid=source?.version===1&&source.coordinateSpace==='vehicle-local-game-xyz'&&source.units==='m'&&['windscreenLower','windscreenUpper','hoodRear'].every(k=>chain(source[k]));
 const raw=valid?source:{windscreenLower:transverse(.83,.80,.92,.035),windscreenUpper:transverse(.68,.035,1.335,.035),hoodRear:transverse(.68,.84,.899,.0075),panelThickness:{hood:.008,cowl:.014,body:.012}};
 const result={version:1,fromExtras:!!valid,scale:s.toArray(),panelThickness:{hood:.008,cowl:.014,body:.012,...raw.panelThickness},roles:raw.roles||{},fixedCorners:{}};
 for(const key of['windscreenLower','windscreenUpper','hoodRear'])result[key]=raw[key].map(p=>scaled(p,s)).sort((a,b)=>a[0]-b[0]);
 for(const key of['windscreenInnerLower','hoodRearInner','cowlFront'])if(chain(raw[key]))result[key]=raw[key].map(p=>scaled(p,s)).sort((a,b)=>a[0]-b[0]);
 result.windscreenInnerLower??=result.windscreenLower.map(([x,y,z])=>[x,y-result.panelThickness.cowl*s.y,z]);
 for(const [name,side]of[['left',-1],['right',1]]){
  const foot=result.windscreenLower[side<0?0:result.windscreenLower.length-1],defaults={aPillarFoot:foot,doorFrontUpper:[side*.835,.852,.622],doorFrontLower:[side*.835,.23,.622],cowlOuter:foot};
  result.fixedCorners[name]=Object.fromEntries(Object.entries(defaults).map(([k,p])=>[k,point(raw.fixedCorners?.[name]?.[k])?scaled(raw.fixedCorners[name][k],s):p.slice()]));
 }
 return result;
}
export function driverExteriorRole(object,assembly){
 for(let o=object;o;o=o.parent){
  if(typeof o.userData?.driverVisibleExterior==='boolean')return o.userData.driverVisibleExterior;
  const role=assembly.roles[o.name]||assembly.roles[o.name.replaceAll('_',' ')];if(role?.driverVisibleExterior!==undefined)return !!role.driverVisibleExterior;
 }
 if(assembly.fromExtras)return false;
 for(let o=object;o;o=o.parent)if(/^(Driver hood|Window windscreen|Lux continuous body|Continuous canopy shoulder transition|Mirror )/.test(o.name.replaceAll('_',' ')))return true;
 return false;
}
/** Legacy GLBs have one combined body. Clip its front structure, not its paint material. */
export function clipFrontGeometry(geometry,zMin){
 const attributes=Object.keys(geometry.attributes).filter(k=>['position','normal','uv'].includes(k)),out=Object.fromEntries(attributes.map(k=>[k,[]])),index=geometry.index,count=index?.count||geometry.attributes.position.count;
 const vertex=i=>Object.fromEntries(attributes.map(k=>[k,Array.from({length:geometry.attributes[k].itemSize},(_,j)=>geometry.attributes[k].array[i*geometry.attributes[k].itemSize+j])]));
 const mix=(a,b,t)=>Object.fromEntries(attributes.map(k=>[k,a[k].map((v,j)=>THREE.MathUtils.lerp(v,b[k][j],t))]));
 for(let i=0;i<count;i+=3){let input=[0,1,2].map(k=>vertex(index?index.getX(i+k):i+k)),poly=[];
  for(let j=0;j<3;j++){const a=input[j],b=input[(j+1)%3],insideA=a.position[2]>=zMin,insideB=b.position[2]>=zMin;if(insideA)poly.push(a);if(insideA!==insideB)poly.push(mix(a,b,(zMin-a.position[2])/(b.position[2]-a.position[2])));}
  for(let j=1;j<poly.length-1;j++)for(const p of[poly[0],poly[j],poly[j+1]])for(const k of attributes)out[k].push(...p[k]);
 }
 const g=new THREE.BufferGeometry();for(const k of attributes)g.setAttribute(k,new THREE.Float32BufferAttribute(out[k],geometry.attributes[k].itemSize));g.computeBoundingSphere();return g;
}
/** Structural copies share one rigid frame with the dash while the outside body can pitch. */
export function createDriverExterior(body,assembly,{paintMaterial,ownedGeometries=[]}={}){
 const root=new THREE.Group();root.name='Driver exterior assembly';body.updateMatrixWorld(true);
 const inverseParent=body.parent?body.parent.matrixWorld.clone().invert():new THREE.Matrix4();
 body.traverse(o=>{if(!o.isMesh||!driverExteriorRole(o,assembly))return;
  const copy=o.clone(false),matrix=inverseParent.clone().multiply(o.matrixWorld);copy.name=o.name;copy.children=[];
  const legacyClip=!assembly.fromExtras&&/^(Lux continuous body|Continuous canopy shoulder transition)/.test((o.parent?.name||o.name).replaceAll('_',' '));
  // GLTF single-primitive meshes can carry the role directly; multi-primitive meshes inherit it.
  const needsClip=legacyClip||(!assembly.fromExtras&&/^(Lux continuous body|Continuous canopy shoulder transition)/.test(o.name.replaceAll('_',' ')));
  if(needsClip){copy.geometry=o.geometry.clone().applyMatrix4(matrix);const clipped=clipFrontGeometry(copy.geometry,.68*assembly.scale[2]);copy.geometry.dispose();copy.geometry=clipped;ownedGeometries.push(clipped);copy.position.set(0,0,0);copy.quaternion.identity();copy.scale.set(1,1,1);}
  else matrix.decompose(copy.position,copy.quaternion,copy.scale);
  const material=m=>m.name==='Paint'&&paintMaterial?paintMaterial:m;
  copy.material=Array.isArray(o.material)?o.material.map(material):material(o.material);copy.castShadow=false;copy.receiveShadow=true;root.add(copy);
 });
 root.userData.assemblySource=assembly.fromExtras?'GLB extras':'legacy structural fallback';return root;
}

/** Interior glazing uses stable standard alpha blending, not the external reflection shader. */
export function createDriverGlazingMaterial(){
 return new THREE.MeshStandardMaterial({name:'Driver interior glazing',color:'#b7c6c9',roughness:.10,metalness:0,transparent:true,opacity:.045,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,envMapIntensity:.08});
}
