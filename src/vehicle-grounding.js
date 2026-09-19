import * as THREE from 'three';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const HEIGHT=.027;

// Evaluate wheel bounds once in the vehicle root frame, independent of the
// vehicle's current world pose. The independent wheel rig supplies rest geometry.
function wheelFootprints(car){
 car.root.updateMatrixWorld(true);
 const inverse=car.root.matrixWorld.clone().invert(),matrix=new THREE.Matrix4();
 return car.wheels.map(wheel=>{
  const bounds=new THREE.Box3();
  wheel.traverse(node=>{
   if(!node.isMesh)return;
   if(!node.geometry.boundingBox)node.geometry.computeBoundingBox();
   matrix.multiplyMatrices(inverse,node.matrixWorld);
   bounds.union(node.geometry.boundingBox.clone().applyMatrix4(matrix));
  });
  if(bounds.isEmpty())throw new Error('Vehicle grounding requires wheel geometry: '+wheel.name);
  const centre=bounds.getCenter(new THREE.Vector3()),radius=Number(wheel.userData.radius)||(bounds.max.y-bounds.min.y)/2;
  return {name:wheel.name,x:centre.x,z:centre.z,halfWidth:clamp((bounds.max.x-bounds.min.x)*.55,.12,.30),halfLength:clamp(radius*.70,.18,.31)};
 });
}

/** One texture-free draw for a soft underbody shadow and four tyre contacts.
 * Add root directly to the scene (not to the pitching vehicle shell), then call
 * update(s,d,yaw,{night,quality}) with the same interpolated driving pose.
 */
export function createVehicleGrounding(car,track){
 if(!car?.root||car.wheels?.length!==4)throw new Error('Vehicle grounding requires four authored wheels');
 if(!track?.sample)throw new Error('Vehicle grounding requires a track');
 const tyres=wheelFootprints(car),xs=tyres.map(p=>p.x),zs=tyres.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
 const patches=[{x:(minX+maxX)/2,z:(minZ+maxZ)/2,halfWidth:Math.max(.65,(maxX-minX)*.54),halfLength:(maxZ-minZ)/2+.42,columns:2,rows:3,strength:.65},...tyres.map(p=>({...p,columns:1,rows:1,strength:1.15}))];
 const local=[],uv=[],strength=[],indices=[];
 for(const patch of patches){
  const first=local.length;
  for(let z=0;z<=patch.rows;z++)for(let x=0;x<=patch.columns;x++){
   const u=x/patch.columns,v=z/patch.rows;
   local.push({x:patch.x+(u*2-1)*patch.halfWidth,z:patch.z+(v*2-1)*patch.halfLength});uv.push(u,v);strength.push(patch.strength);
  }
  for(let z=0;z<patch.rows;z++)for(let x=0;x<patch.columns;x++){
   const a=first+z*(patch.columns+1)+x,b=a+patch.columns+1;indices.push(a,b,a+1,a+1,b,b+1);
  }
 }
 const geometry=new THREE.BufferGeometry(),positions=new THREE.Float32BufferAttribute(new Float32Array(local.length*3),3),bounds=new THREE.Float32BufferAttribute(new Float32Array(local.length*3),3);
 positions.setUsage(THREE.DynamicDrawUsage);bounds.setUsage(THREE.DynamicDrawUsage);
 geometry.setAttribute('position',positions);geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('contactStrength',new THREE.Float32BufferAttribute(strength,1));geometry.setAttribute('roadBounds',bounds);geometry.setIndex(indices);
 // The patch stays within this small sphere; no per-frame bounds traversal.
 geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),Math.max(...local.map(p=>Math.hypot(p.x,p.z)))+2);
 const material=new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,depthTest:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,toneMapped:false,
  uniforms:{opacity:{value:.18}},
  vertexShader:`attribute float contactStrength;attribute vec3 roadBounds;varying vec2 vUv;varying vec3 vBounds;varying float vStrength,vDistanceFade;
   void main(){vUv=uv;vStrength=contactStrength;vBounds=roadBounds;vec4 mv=modelViewMatrix*vec4(position,1.);vDistanceFade=1.-smoothstep(45.,160.,length(mv.xyz));gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`uniform float opacity;varying vec2 vUv;varying vec3 vBounds;varying float vStrength,vDistanceFade;
   void main(){if(abs(vBounds.z)>vBounds.y||(vBounds.x>.001&&abs(vBounds.z)<vBounds.x+.025))discard;
    vec2 p=(vUv-.5)*2.;float edge=max(0.,1.-dot(p,p));float alpha=edge*edge*opacity*vStrength*vDistanceFade;
    gl_FragColor=vec4(0.,0.,0.,alpha);}`
 });
 const root=new THREE.Mesh(geometry,material);root.name='Vehicle contact shading';root.castShadow=false;root.receiveShadow=false;root.visible=false;
 const stats={vertices:local.length,triangles:indices.length/3,drawCalls:1,lights:0,textures:0},position=new THREE.Vector3();let disposed=false;
 return {root,stats,wheelContacts:tyres.map(p=>({...p})),
  update(s,d,yaw,{night=0,quality='balanced'}={}){
   if(disposed)return;
   root.visible=car.root.visible!==false;if(!root.visible)return;
   const centre=track.sample(s),sin=Math.sin(yaw),cos=Math.cos(yaw),curvature=centre.curvature||0;
   root.position.copy(centre.p).addScaledVector(centre.right,d);
   for(let i=0;i<local.length;i++){
    const p=local[i],across=cos*p.x+sin*p.z,along=cos*p.z-sin*p.x;
    const deltaS=along/Math.max(.65,1-curvature*d),q=track.sample(s+deltaS),lateral=d+across-curvature*deltaS*deltaS*.5;
    position.copy(q.p).addScaledVector(q.right,lateral);position.y+=HEIGHT;position.sub(root.position);
    positions.setXYZ(i,position.x,position.y,position.z);bounds.setXYZ(i,q.medianHalfWidth||0,q.asphaltHalfWidth||8.4,lateral);
   }
   positions.needsUpdate=true;bounds.needsUpdate=true;
   material.uniforms.opacity.value=.18+clamp(night,0,1)*.075+(quality==='low'?.035:0);
  },
  dispose(){if(disposed)return;disposed=true;root.visible=false;root.removeFromParent();geometry.dispose();material.dispose();}
 };
}
