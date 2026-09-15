import * as THREE from 'three';

export const SEA_LEVEL=-4;

// Two normalized bytes retain centimetre precision without float-filter support
// on mobile GPUs. Decode after linear filtering: the encoding is linear.
export function createCoastalHeightTexture(positions,width,height,bounds){
 const data=new Uint8Array(width*height*4);
 for(let i=0;i<width*height;i++){
  const encoded=Math.round(THREE.MathUtils.clamp((positions[i*3+1]+32)/512,0,1)*65535);
  data[i*4]=encoded>>8;data[i*4+1]=encoded&255;data[i*4+3]=255;
 }
 const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat);
 texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
 return {texture,bounds:new THREE.Vector4(...bounds),size:new THREE.Vector2(width,height)};
}

// Concentrate vertices around the viewer; the horizon uses progressively larger
// quads. The wave phase always uses world coordinates, even when the grid moves.
export function createOceanGeometry(segments=160){
 const geometry=new THREE.PlaneGeometry(17000,17000,segments,segments);
 geometry.rotateX(-Math.PI/2);
 const p=geometry.attributes.position;
 for(let i=0;i<p.count;i++)for(const axis of ['X','Z']){
  const v=p['get'+axis](i)/8500;p['set'+axis](i,Math.sign(v)*Math.pow(Math.abs(v),3)*8500);
 }
 geometry.computeBoundingSphere();return geometry;
}

const waves=`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float seabed(vec2 p){
 vec2 uv=(p-coastBounds.xy)/coastBounds.zw;
 if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return -32.;
 vec2 texelUV=(uv*(coastSize-1.)+.5)/coastSize;
 vec2 packed=texture2D(coastHeight,texelUV).rg;
 return dot(packed,vec2(256.,1.))*(512./257.)-32.;
}
float swell(vec2 p){
 return sin(dot(p,vec2(.074,.035))-time*1.02)*.19
       +sin(dot(p,vec2(-.043,.092))-time*1.24+.7)*.11
       +sin(dot(p,vec2(.16,.11))-time*1.61+1.8)*.055;
}`;
const declarations=`uniform float time,wet,night,daylight;uniform vec3 sunDir;
uniform sampler2D coastHeight;uniform vec4 coastBounds;uniform vec2 coastSize,oceanCenter;
varying vec3 vWaterP;`;

export function buildCoastalOcean(world){
 const field=world.coastalHeightField||createCoastalHeightTexture([0,-32,0],1,1,[-1,-1,2,2]);
 const uniforms={...world.uniforms,coastHeight:{value:field.texture},coastBounds:{value:field.bounds},coastSize:{value:field.size},oceanCenter:{value:new THREE.Vector2()}};
 const mat=new THREE.ShaderMaterial({uniforms,
  vertexShader:declarations+waves+`
  void main(){
   vec3 p=position;p.xz+=oceanCenter;
   float depth=max(0.,-4.-seabed(p.xz));
   float amplitude=smoothstep(.0,3.,depth)*(1.-smoothstep(550.,1600.,length(position.xz)));
   p.y=-4.+swell(p.xz)*amplitude*(1.+wet*.6);
   vWaterP=p;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
  }`,
  fragmentShader:declarations+waves+`
  void main(){
   vec2 p=vWaterP.xz;float distanceToEye=distance(cameraPosition,vWaterP);
   float depth=max(0.,-4.-seabed(p));
   vec3 view=normalize(cameraPosition-vWaterP);
   float a=dot(p,vec2(.074,.035))-time*1.02;
   float b=dot(p,vec2(-.043,.092))-time*1.24+.7;
   float c=dot(p,vec2(.16,.11))-time*1.61+1.8;
   vec2 slope=cos(a)*vec2(.074,.035)*.19+cos(b)*vec2(-.043,.092)*.11+cos(c)*vec2(.16,.11)*.055;
   // Wind ripples use a continuous irregular height field, rather than parallel
   // sine bands. Filter octave height before differentiating the normals.
   vec2 drift=vec2(time*.36,-time*.16);
   vec2 rip=p*vec2(.48,.82)+drift;
   float footprint=max(length(dFdx(p)),length(dFdy(p)));
   float medium=1.-smoothstep(1.,5.,footprint);
   float fine=1.-smoothstep(.15,1.2,footprint);
   float h0=noise(rip)*.10+noise(rip*3.1-drift*1.7)*.024*fine;
   float hx=noise(rip+vec2(.048,0.))*.10+noise((rip+vec2(.048,0.))*3.1-drift*1.7)*.024*fine;
   float hz=noise(rip+vec2(0.,.082))*.10+noise((rip+vec2(0.,.082))*3.1-drift*1.7)*.024*fine;
   slope+=vec2(hx-h0,hz-h0)*10.*medium;
   slope*=mix(.32,1.,smoothstep(0.,2.,depth))*(1.+wet*.8);
   vec3 n=normalize(vec3(-slope.x,1.,-slope.y));
   vec3 reflected=reflect(-view,n);
   float fresnel=.0204+.9796*pow(1.-max(dot(view,n),0.),5.);
   // Beer-Lambert style depth colour: turquoise near shore, blue-green offshore.
   vec3 deep=vec3(.009,.068,.093),shallow=vec3(.052,.24,.225);
   vec3 water=mix(deep,shallow,exp(-depth*.26));
   water*=.91+noise(p*.025)*.18;
   vec3 horizon=mix(vec3(.58,.40,.25),vec3(.38,.56,.68),daylight);
   vec3 zenith=mix(vec3(.065,.17,.28),vec3(.045,.20,.39),daylight);
   vec3 reflection=mix(horizon,zenith,pow(clamp(reflected.y,0.,1.),.43));
   vec2 cloudP=reflected.xz/max(.12,reflected.y+.12);
   float cloud=noise(cloudP*1.45+vec2(time*.0018,0.))*.7+noise(cloudP*3.2)*.3;
   reflection=mix(reflection,mix(vec3(.64,.55,.43),vec3(.72,.80,.83),daylight),smoothstep(.52,.76,cloud)*.6);
   reflection=mix(reflection,vec3(.21,.28,.32),wet*.65);
   vec3 color=mix(water,reflection,fresnel);
   // A broad specular lobe remains stable at distance; close ripples break up glints.
   vec3 halfVector=normalize(normalize(sunDir)+view);
   float NoH=max(dot(n,halfVector),0.);
   float alpha=mix(.045,.15,smoothstep(150.,1800.,distanceToEye))+wet*.05;
   float a2=alpha*alpha,denom=NoH*NoH*(a2-1.)+1.;
   float distribution=a2/(3.14159*denom*denom);
   float sunF=.02+.98*pow(1.-max(dot(view,halfVector),0.),5.);
   vec3 sunColor=mix(vec3(1.,.64,.29),vec3(1.,.91,.73),daylight);
   color+=sunColor*min(3.,distribution*sunF*.24)*(1.-wet*.85);
   // The foam is constrained by actual seabed depth, not arbitrary white stripes.
   float breakup=noise(p*.6+vec2(-time*.22,time*.14));
   float surge=.65+.35*sin(time*1.35+noise(p*.08)*4.);
   float shoreBand=(1.-smoothstep(.08,1.6+surge*.6,depth))*smoothstep(0.,.14,depth);
   float shoreFoam=shoreBand*smoothstep(.31,.73,breakup+sin(depth*4.-time*1.9)*.15);
   float breaker=(1.-smoothstep(1.1,3.4,depth))*smoothstep(.78,.98,sin(depth*3.-time*1.5+noise(p*.12)*2.))*smoothstep(.44,.7,breakup)*.28;
   float whitecaps=smoothstep(.78,.93,noise(p*.11+time*.04))*smoothstep(.6,.91,cos(a)*.55+cos(b)*.45)*wet*.16;
   color=mix(color,vec3(.62,.72,.70),clamp(shoreFoam*.65+breaker+whitecaps,0.,.78));
   color=mix(color,color*.10+vec3(.003,.010,.018),night);
   float haze=1.-exp(-distanceToEye*.00021);
   vec3 hazeColor=mix(mix(vec3(.53,.47,.37),vec3(.50,.62,.67),daylight),vec3(.30,.37,.40),wet*.7);
   hazeColor=mix(hazeColor,vec3(.024,.045,.065),night);
   gl_FragColor=vec4(mix(color,hazeColor,haze),1.);
  }`});
 const sea=new THREE.Mesh(createOceanGeometry(),mat);sea.name='Coastal ocean';sea.frustumCulled=false;
 sea.onBeforeRender=()=>uniforms.oceanCenter.value.set(Math.floor(world.camera.position.x/16)*16,Math.floor(world.camera.position.z/16)*16);
 world.ocean=sea;world.oceanStats={triangles:sea.geometry.index.count/3,heightTextureBytes:field.texture.image.data.byteLength};world.scene.add(sea);
}
