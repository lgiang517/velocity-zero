import * as THREE from 'three';

const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const smooth=(a,b,value)=>{const t=clamp((value-a)/(b-a));return t*t*(3-2*t);};

/** A bounded, texture-free draw for tyre smoke and wet-road spray.
 * Uses the authored wheel contact locations, not the exhaust or body centre.
 * Existing collision sparks intentionally remain a separate effect.
 */
export function createTireEffects(track,{coarse=false,random=Math.random}={}){
 if(!track?.sample)throw new Error('Tyre effects require a track');
 const capacity=coarse?64:112,centres=new Float32Array(capacity*3),appearance=new Float32Array(capacity*4),ground=new Float32Array(capacity),velocity=new Float32Array(capacity*3),age=new Float32Array(capacity),life=new Float32Array(capacity),baseSize=new Float32Array(capacity),strength=new Float32Array(capacity),kind=new Uint8Array(capacity);
 const plane=new THREE.PlaneGeometry(1,1),geometry=new THREE.InstancedBufferGeometry();
 geometry.index=plane.index;geometry.attributes.position=plane.attributes.position;geometry.attributes.uv=plane.attributes.uv;geometry.instanceCount=capacity;
 const centreAttribute=new THREE.InstancedBufferAttribute(centres,3).setUsage(THREE.DynamicDrawUsage),appearanceAttribute=new THREE.InstancedBufferAttribute(appearance,4).setUsage(THREE.DynamicDrawUsage),groundAttribute=new THREE.InstancedBufferAttribute(ground,1).setUsage(THREE.DynamicDrawUsage);
 geometry.setAttribute('particleCentre',centreAttribute);geometry.setAttribute('appearance',appearanceAttribute);geometry.setAttribute('groundHeight',groundAttribute);
 const material=new THREE.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,blending:THREE.NormalBlending,fog:true,
  uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),smokeColor:{value:new THREE.Color('#a3a39e')},mistColor:{value:new THREE.Color('#c0ced0')},lightLevel:{value:1}},
  vertexShader:`attribute vec3 particleCentre;attribute vec4 appearance;attribute float groundHeight;
   varying vec2 vUv;varying float vAlpha,vKind,vGroundDistance;
   #include <fog_pars_vertex>
   void main(){
    vUv=uv;vAlpha=appearance.y;vKind=appearance.z;
    float angle=appearance.w,c=cos(angle),s=sin(angle);
    vec2 corner=mat2(c,-s,s,c)*position.xy*appearance.x;
    vec4 mvPosition=modelViewMatrix*vec4(particleCentre,1.);
    mvPosition.xy+=corner;
    vec3 worldCentre=(modelMatrix*vec4(particleCentre,1.)).xyz;
    float worldY=worldCentre.y+viewMatrix[1][0]*corner.x+viewMatrix[1][1]*corner.y;
    vGroundDistance=worldY-groundHeight;
    vAlpha*=smoothstep(.5,2.,-mvPosition.z);
    gl_Position=projectionMatrix*mvPosition;
    #include <fog_vertex>
   }`,
  fragmentShader:`uniform vec3 smokeColor,mistColor;uniform float lightLevel;
   varying vec2 vUv;varying float vAlpha,vKind,vGroundDistance;
   #include <fog_pars_fragment>
   void main(){
    vec2 p=(vUv-.5)*2.;
    float radius=length(p);
    float lobes=1.+.09*sin(p.x*5.+p.y*2.)+.07*sin(p.y*6.-p.x*3.);
    float edge=1.-smoothstep(.12,.98,radius*lobes);
    float alpha=edge*vAlpha*smoothstep(0.,.14,vGroundDistance);
    if(alpha<.002)discard;
    gl_FragColor=vec4(mix(smokeColor,mistColor,vKind)*lightLevel,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
   }`
 });
 const root=new THREE.Mesh(geometry,material);root.name='Soft tyre smoke and water mist';root.frustumCulled=false;root.visible=false;root.castShadow=false;root.receiveShadow=false;
 const stats={capacity,active:0,smoke:0,mist:0,emittedSmoke:0,emittedMist:0,drawCalls:0,textures:0,smokeRate:0,mistRate:0};
 let cursor=0,smokeRemainder=0,mistRemainder=0,wheelCursor=0,lastCar=null,sourceCar=null,rearContacts=[],disposed=false,lastS=null,lastD=null;
 const sources=[new THREE.Vector3(),new THREE.Vector3()],forward=new THREE.Vector3(),right=new THREE.Vector3();
 function reset(){life.fill(0);appearance.fill(0);smokeRemainder=mistRemainder=0;stats.active=stats.smoke=stats.mist=stats.drawCalls=0;root.visible=false;appearanceAttribute.needsUpdate=true;}
 function wheelSources(player,car){
  if(car!==sourceCar){
   sourceCar=car;
   const contacts=car?.grounding?.wheelContacts;
   rearContacts=contacts?.length>=4?[...contacts].sort((a,b)=>a.z-b.z).slice(0,2):[-1,1].map(side=>({x:side*(player.config?.width||2.1)*.38,z:-(player.config?.wheelbase||2.8)*.49}));
  }
  const centre=track.sample(player.s),yaw=player.yaw||0,sin=Math.sin(yaw),cos=Math.cos(yaw),curvature=centre.curvature||0;
  const heading=(centre.heading||0)+yaw;forward.set(Math.sin(heading),centre.slope||0,Math.cos(heading)).normalize();right.set(Math.cos(heading),0,-Math.sin(heading));
  for(let w=0;w<2;w++){
   const p=rearContacts[w],across=cos*p.x+sin*p.z,along=cos*p.z-sin*p.x,deltaS=along/Math.max(.65,1-curvature*player.d),q=track.sample(player.s+deltaS),lateral=player.d+across-curvature*deltaS*deltaS*.5;
   sources[w].copy(q.p).addScaledVector(q.right,lateral);sources[w].y+=.04;
  }
 }
 function spawn(type,intensity,player,frameOffset){
  const i=cursor++%capacity,k=i*3,source=sources[wheelCursor++%2],speed=Math.abs(player.u),travel=player.u<0?-1:1;
  // Trail is left in world space; a small rearward wake gently disperses it.
  const wake=-(.45+speed*(type?.035:.018))*travel,lateral=(random()-.5)*(type?.8:1.2),rise=type?.12+random()*.18:.35+random()*.23;
  centres[k]=source.x-(forward.x*player.u+right.x*(player.v||0))*frameOffset;centres[k+1]=source.y+.11-forward.y*player.u*frameOffset;centres[k+2]=source.z-(forward.z*player.u+right.z*(player.v||0))*frameOffset;
  ground[i]=source.y-.015-forward.y*player.u*frameOffset;
  velocity[k]=forward.x*wake+right.x*lateral;velocity[k+1]=rise;velocity[k+2]=forward.z*wake+right.z*lateral;
  life[i]=type?.32+random()*.2:.55+random()*.2;age[i]=0;kind[i]=type;baseSize[i]=type?.95+random()*.2:.8+random()*.2;strength[i]=(type?.035:.085)*intensity;
  appearance[i*4]=baseSize[i];appearance[i*4+1]=0;appearance[i*4+2]=type;appearance[i*4+3]=random()*Math.PI*2;
  if(type)stats.emittedMist++;else stats.emittedSmoke++;
 }
 return {root,stats,reset,
  update(dt,{player,car,active=true,wet=0,night=0,tunnel=0,lockedWheels=false}={}){
   if(disposed||!player)return;
   const delta=clamp(Number.isFinite(dt)?dt:0,0,.1);
   // Teleports, restarts and vehicle swaps must not carry an old trail forward.
   if(car!==lastCar){sourceCar=null;rearContacts=[];}
   if(car!==lastCar||(lastS!==null&&(Math.abs(player.s-lastS)>Math.max(25,Math.abs(player.u)*delta*4)||Math.abs(player.d-lastD)>8)))reset();
   lastS=player.s;lastD=player.d;lastCar=car;
   const speed=Math.abs(player.u),moving=smooth(7,18,speed),skid=smooth(.09,.24,Math.abs(player.slip||0)),lock=lockedWheels?smooth(.8,1,player.brake||0):0;
   const smoke=active?Math.max(skid,lock*.65)*moving*(1-smooth(.12,.65,wet)):0;
   const spray=active?smooth(.25,.8,wet)*smooth(13,38,speed):0;
   // Keep faint trails continuous; intensity controls opacity rather than sparse puffs.
   const rateScale=coarse?.72:1;stats.smokeRate=smooth(0,.10,smoke)*96*rateScale;stats.mistRate=smooth(0,.10,spray)*120*rateScale;
   const totalRate=stats.smokeRate+stats.mistRate,maxRate=coarse?110:195;
   if(totalRate>maxRate){stats.smokeRate*=maxRate/totalRate;stats.mistRate*=maxRate/totalRate;}
   if(smoke+spray>0){
    wheelSources(player,car);
    smokeRemainder+=stats.smokeRate*delta;mistRemainder+=stats.mistRate*delta;
    const smokeCount=Math.floor(smokeRemainder),mistCount=Math.floor(mistRemainder);smokeRemainder-=smokeCount;mistRemainder-=mistCount;
    for(let n=0;n<smokeCount;n++)spawn(0,smoke,player,delta*(n+.5)/smokeCount);
    for(let n=0;n<mistCount;n++)spawn(1,spray,player,delta*(n+.5)/mistCount);
   }else{smokeRemainder=0;mistRemainder=0;}
   stats.active=stats.smoke=stats.mist=0;
   for(let i=0;i<capacity;i++){
    if(life[i]<=0)continue;
    age[i]+=delta;const t=age[i]/life[i],k=i*3,a=i*4;
    if(t>=1){life[i]=0;appearance[a+1]=0;continue;}
    const drag=Math.exp(-delta*(kind[i]?1.8:1.2));
    for(let j=0;j<3;j++){centres[k+j]+=velocity[k+j]*delta;velocity[k+j]*=drag;}
    appearance[a]=Math.min(coarse?1.6:1.9,baseSize[i]+t*(kind[i]?.65:.8));
    appearance[a+1]=strength[i]*smooth(0,.12,t)*(1-smooth(.36,1,t));
    stats.active++;if(kind[i])stats.mist++;else stats.smoke++;
   }
   material.uniforms.lightLevel.value=(1-clamp(night)*.68)*(1-clamp(tunnel)*.52);
   root.visible=stats.active>0;stats.drawCalls=root.visible?1:0;
   if(root.visible){centreAttribute.needsUpdate=true;appearanceAttribute.needsUpdate=true;groundAttribute.needsUpdate=true;}
  },
  dispose(){if(disposed)return;disposed=true;root.removeFromParent();root.visible=false;geometry.dispose();material.dispose();plane.dispose();}
 };
}


