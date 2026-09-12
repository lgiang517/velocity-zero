import {environmentAssets} from './environment-assets.js';
import * as THREE from 'three';
const noiseGLSL=`
float ahash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float anoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(ahash(i),ahash(i+vec2(1,0)),f.x),mix(ahash(i+vec2(0,1)),ahash(i+vec2(1,1)),f.x),f.y);}
float afbm(vec2 p){return anoise(p)*.55+anoise(p*2.03)*.28+anoise(p*4.1)*.12+anoise(p*8.2)*.05;}`;

export function buildAtmosphere(world){
 world.uniforms.daylight={value:0};
 const mat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:world.uniforms,
  vertexShader:'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`varying vec3 vDirection;uniform float time,wet,night,daylight;uniform vec3 sunDir;${noiseGLSL}
  void main(){
   vec3 d=normalize(vDirection);float h=max(d.y,0.);float facing=pow(max(dot(d,sunDir),0.),5.);
   vec3 horizon=mix(vec3(.68,.49,.32),vec3(.45,.65,.77),daylight);
   vec3 zenith=mix(vec3(.065,.17,.28),vec3(.045,.20,.39),daylight);
   vec3 color=mix(horizon,zenith,pow(smoothstep(-.05,.85,d.y),.43));
   color+=vec3(.46,.22,.08)*facing*(1.-daylight*.7)*(1.-wet);
   float sun=max(dot(d,sunDir),0.);
   color+=vec3(1.,.82,.48)*pow(sun,150.)*.8*(1.-wet);
   color+=vec3(1.,.93,.73)*smoothstep(.9995,.9997,sun)*6.*(1.-wet);
   vec2 plane=d.xz/max(.11,d.y+.11);
   float shape=afbm(plane*1.45+vec2(time*.0018,0.));
   float wisps=afbm(plane*vec2(3.5,5.)+vec2(time*.0011,2.));
   float cover=smoothstep(.49-wet*.15,.73-wet*.1,shape*.83+wisps*.17);
   cover*=smoothstep(.015,.13,h)*(1.-smoothstep(.75,.99,h));
   vec3 cloud=mix(vec3(.37,.40,.43),vec3(.92,.83,.66),smoothstep(.45,.73,shape));
   cloud=mix(cloud,vec3(.87,.92,.96),daylight*.45);cloud+=vec3(.3,.16,.055)*facing;
   color=mix(color,cloud,cover*.93);
   color=mix(color,vec3(.30,.38,.42)+color*.15,wet*.70);
   color=mix(color,vec3(.009,.020,.044)+color*.035,night);
   float stars=step(.999,ahash(floor(d.xz/max(.16,d.y)*1300.)))*smoothstep(.12,.55,h)*night;
   color+=stars*.8*(1.-cover);
   gl_FragColor=vec4(color,1.);
  }`});
 world.sky=new THREE.Mesh(new THREE.SphereGeometry(7500,32,16),mat);world.scene.add(world.sky);
}

export function buildCoastalOcean(world){
 const mat=new THREE.ShaderMaterial({uniforms:world.uniforms,
  vertexShader:'varying vec3 vWaterP;void main(){vec4 p=modelMatrix*vec4(position,1.);vWaterP=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}',
  fragmentShader:`varying vec3 vWaterP;uniform float time,wet,night,daylight;uniform vec3 sunDir;${noiseGLSL}
  void main(){
   vec2 p=vWaterP.xz;vec3 view=normalize(cameraPosition-vWaterP);
   float waveA=sin(dot(p,vec2(.023,.049))+time*.72);
   float waveB=sin(dot(p,vec2(-.062,.021))-time*.94);
   float waveC=sin(dot(p,vec2(.27,.31))+time*1.3+waveA*2.);
   vec3 n=normalize(vec3(waveA*.085+waveC*.016,1.,waveB*.10+waveC*.025));
   float fresnel=.025+.975*pow(1.-max(dot(view,n),0.),4.5);
   vec3 water=mix(vec3(.022,.13,.15),vec3(.065,.25,.28),afbm(p*.005));
   vec3 reflection=mix(vec3(.52,.47,.37),vec3(.32,.49,.60),daylight);
   float reflectedSky=clamp(reflect(-view,n).y,0.,1.);
   reflection=mix(reflection,vec3(.07,.22,.34),reflectedSky);
   vec3 color=mix(water,reflection,fresnel*.86);
   float sun=pow(max(dot(reflect(-sunDir,n),view),0.),210.);
   float sparkle=pow(max(dot(reflect(-sunDir,normalize(n+vec3(waveC*.012,0.,waveC*.02))),view),0.),650.);
   color+=vec3(1.,.72,.37)*(sun*2.8+sparkle*1.3)*(1.-wet*.8);
   color+=smoothstep(.91,.998,waveA*.55+waveB*.35+waveC*.1)*.10;
   color=mix(color,color*.10+vec3(.006,.018,.029),night);
   float haze=1.-exp(-distance(cameraPosition,vWaterP)*.00032);
   color=mix(color,mix(vec3(.53,.57,.55),vec3(.024,.045,.065),night),haze);
   gl_FragColor=vec4(color,1.);
  }`});
 const sea=new THREE.Mesh(new THREE.PlaneGeometry(17000,17000),mat);sea.rotation.x=-Math.PI/2;sea.position.y=-4;world.scene.add(sea);
}

export function createOutdoorEnvironment(renderer){
 const generator=new THREE.PMREMGenerator(renderer);
 const env=generator.fromEquirectangular(environmentAssets.sky);
 generator.dispose();return env;
}
