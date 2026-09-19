import * as THREE from 'three';
import {addRoadChunks} from './world-chunks.js';
const unit=new THREE.Vector3(0,1,0),forward=new THREE.Vector3(),tmp=new THREE.Vector3();
export const ROAD_LIGHT_BUDGET=Object.freeze({street:3,traffic:1,refreshSeconds:.25});
export function nearestRoadLights(fixtures,position,count=3,radius=85){return fixtures.map((fixture,index)=>({fixture,index,distance:fixture.position.distanceToSquared(position)})).filter(q=>q.distance<radius*radius).sort((a,b)=>a.distance-b.distance).slice(0,count);}
/** A fixed light pool illuminates nearby surfaces; static pools keep distant lamps legible. */
export class RoadLighting{
 constructor(world){
  this.world=world;this.fixtures=world.streetLampFixtures||[];this.refresh=0;this.selected=[];
  this.stats={streetBudget:ROAD_LIGHT_BUDGET.street,trafficBudget:ROAD_LIGHT_BUDGET.traffic,fixtures:this.fixtures.length,activeStreet:0,activeTraffic:0,amount:0};
  this.street=Array.from({length:ROAD_LIGHT_BUDGET.street},()=>{const l=new THREE.SpotLight('#ffe0aa',0,48,1.08,.72,2);l.castShadow=false;world.scene.add(l,l.target);return l;});
  this.traffic=new THREE.SpotLight('#e8efff',0,70,.47,.75,1.6);this.traffic.castShadow=false;world.scene.add(this.traffic,this.traffic.target);
  this.poolMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{amount:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;uniform float amount;void main(){vec2 d=(vUv-.5)*2.;float a=pow(max(0.,1.-dot(d,d)),2.);gl_FragColor=vec4(.96,.72,.38,a*amount*.13);}'});
  // Follow actual road curvature and banking rather than laying large flat cards
  // across sloped carriageways. Geometry is built once and spatially culled.
  const positions=[],uv=[],indices=[];
  for(const f of this.fixtures){const q=world.track.sample(f.s),lateral=tmp.copy(f.roadPoint).sub(q.p).dot(q.right),width=q.widthMix>.5?10.2:10.8,first=positions.length/3;
   for(let j=0;j<=6;j++){const s=f.s-15+j*5;for(let i=0;i<=4;i++){const p=world.track.point(s,lateral+(i/4-.5)*width,.063);positions.push(p.x,p.y,p.z);uv.push(i/4,j/6);}}
   for(let j=0;j<6;j++)for(let i=0;i<4;i++){const a=first+j*5+i,b=a+5;indices.push(a,b,a+1,a+1,b,b+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();addRoadChunks(world.scene,g,this.poolMaterial,{name:'Streetlight pools',receive:false,size:240});
 }
 update(dt,position,night){
  const amount=THREE.MathUtils.smoothstep(night,.12,.72);this.stats.amount=amount;this.poolMaterial.uniforms.amount.value=amount;
  for(const m of this.world.bridgeLampMaterials||[])m.emissiveIntensity=.08+amount*3.2;
  this.refresh-=dt;
  if(this.refresh<=0){this.refresh=ROAD_LIGHT_BUDGET.refreshSeconds;this.selected=nearestRoadLights(this.fixtures,position);}
  this.stats.activeStreet=0;
  for(let i=0;i<this.street.length;i++){const light=this.street[i],item=this.selected[i];light.intensity=0;if(!item||amount<.001)continue;
   const f=item.fixture;light.position.copy(f.position);light.target.position.copy(f.roadPoint);light.intensity=340*amount;this.stats.activeStreet++;
  }
 }
 updateTraffic(vehicles,position,night,tunnel=0){
  const amount=Math.max(THREE.MathUtils.smoothstep(night,.12,.72),tunnel);this.traffic.intensity=0;this.stats.activeTraffic=0;if(amount<.001)return;
  let best=null,distance=75*75;
  for(const v of vehicles){if(!v.mesh.root.visible)continue;const d=v.mesh.root.position.distanceToSquared(position);if(d<distance){best=v;distance=d;}}
  if(!best)return;const root=best.mesh.root;root.getWorldDirection(forward);this.traffic.position.copy(root.position).addScaledVector(forward,2.1).addScaledVector(unit,.65);this.traffic.target.position.copy(root.position).addScaledVector(forward,38);this.traffic.intensity=165*amount;this.stats.activeTraffic=1;
 }
}
