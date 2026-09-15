import {environmentAssets} from './environment-assets.js';
import * as THREE from 'three';
// Tileable density baked once. Three filtered texture reads replace the old
// full-screen eight-octave sine noise; no ray marching or extra render passes.
export function createCloudDensity(size=256){
 const data=new Uint8Array(size*size*4),sum=new Float32Array(size*size),fine=new Float32Array(size*size);
 let weightSum=0;
 for(let octave=0;octave<6;octave++){
  const period=4*2**octave,weight=2**(-octave*.8),grid=new Float32Array(period*period);
  for(let i=0;i<grid.length;i++){const n=Math.sin(i*127.1+octave*311.7+17)*43758.5453;grid[i]=n-Math.floor(n);}
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const px=x/size*period,py=y/size*period,ix=Math.floor(px),iy=Math.floor(py);let u=px-ix,v=py-iy;u=u*u*(3-2*u);v=v*v*(3-2*v);
   const at=(dx,dy)=>grid[((iy+dy)%period)*period+(ix+dx)%period];
   const value=(at(0,0)*(1-u)+at(1,0)*u)*(1-v)+(at(0,1)*(1-u)+at(1,1)*u)*v;
   sum[y*size+x]+=value*weight;if(octave===3)fine[y*size+x]=value;
  }weightSum+=weight;
 }
 for(let i=0;i<size*size;i++){data[i*4]=Math.round(sum[i]/weightSum*255);data[i*4+1]=Math.round(fine[i]*255);data[i*4+2]=128;data[i*4+3]=255;}
 const map=new THREE.DataTexture(data,size,size);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;return map;
}
const noiseGLSL=`float ahash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}`;

export function buildAtmosphere(world){
 world.uniforms.daylight={value:0};
 const mat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{...world.uniforms,cloudDensity:{value:createCloudDensity()}},
  vertexShader:'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`varying vec3 vDirection;uniform float time,wet,night,daylight;uniform vec3 sunDir;uniform sampler2D cloudDensity;${noiseGLSL}
  void main(){
   vec3 d=normalize(vDirection);float h=max(d.y,0.);float facing=pow(max(dot(d,sunDir),0.),5.);
   vec3 horizon=mix(vec3(.68,.49,.32),vec3(.45,.65,.77),daylight);
   vec3 zenith=mix(vec3(.065,.17,.28),vec3(.045,.20,.39),daylight);
   vec3 color=mix(horizon,zenith,pow(smoothstep(-.05,.85,d.y),.43));
   color+=vec3(.46,.22,.08)*facing*(1.-daylight*.7)*(1.-wet);
   float sun=max(dot(d,sunDir),0.);
   vec2 plane=d.xz/max(.065,d.y+.055);
   vec2 cloudUV=plane*.16+vec2(time*.00011,0.);
   vec2 field=texture2D(cloudDensity,cloudUV).rg;
   float density=field.r;
   float cover=smoothstep(.49-wet*.13,.65-wet*.09,density);
   cover*=smoothstep(.025,.12,h);
   // Sunward density difference gives the cloud body a shaded base and lit rim.
   float sunward=texture2D(cloudDensity,cloudUV+normalize(sunDir.xz)*.017).r;
   float lighting=clamp(.57+(density-sunward)*3.8+field.g*.18,0.,1.);
   vec3 cloud=mix(vec3(.34,.40,.46),vec3(.94,.96,.97),lighting);
   cloud=mix(cloud,cloud*vec3(1.12,.91,.76),1.-daylight);
   cloud+=vec3(.14,.105,.065)*facing*(1.-cover)*2.;
   float cirrus=texture2D(cloudDensity,plane*vec2(.065,.36)+vec2(.42,time*.000035)).g;
   float veil=smoothstep(.58,.85,cirrus)*smoothstep(.06,.3,h)*.19;
   color=mix(color,vec3(.79,.84,.89),veil*(1.-wet));
   color=mix(color,cloud,cover*.97);
   float disc=smoothstep(.999985-fwidth(sun),.999992+fwidth(sun),sun);
   color+=vec3(1.,.91,.73)*(pow(sun,700.)*.26+disc*5.)*(1.-wet)*(1.-cover*.98);
   color=mix(color,vec3(.30,.38,.42)+color*.15,wet*.70);
   color=mix(color,vec3(.009,.020,.044)+color*.035,night);
   float stars=step(.999,ahash(floor(d.xz/max(.16,d.y)*1300.)))*smoothstep(.12,.55,h)*night;
   color+=stars*.8*(1.-cover);
   gl_FragColor=vec4(color,1.);
  }`});
 world.sky=new THREE.Mesh(new THREE.SphereGeometry(7500,32,16),mat);world.scene.add(world.sky);
}

export {buildCoastalOcean} from './ocean.js';

export function createOutdoorEnvironment(renderer){
 const generator=new THREE.PMREMGenerator(renderer);
 const env=generator.fromEquirectangular(environmentAssets.sky);
 generator.dispose();return env;
}
