import * as THREE from 'three';

export const CHINA_ROUTE_ID='china-grand-tour-v1';
// All coordinates are metres in the existing world. The old coastal run remains
// untouched; this western/southern extension replaces only its final short bridge.
export const CHINA_ROUTE_LAYOUT=Object.freeze({
 legacyExit:.89,legacyReturn:.993,
 hzmb:Object.freeze({start:[-600,45,-1450],end:[-3600,45,-1450],length:3000,
  spans:[{id:'jiuzhou',start:130,end:790,towers:[330,598]},{id:'jianghai',start:900,end:1710,towers:[1030,1288,1546]},{id:'qingzhou',start:1800,end:2650,towers:[1985,2443]}],island:[2800,3000]}),
 sichuan:Object.freeze({start:[-3550,70,-630],end:[-2250,145,-630],length:1300,mainSpan:[300,1000],towerStations:[300,1000]}),
 duku:Object.freeze({start:[-2250,145,-630],end:[-900,122,-150],hairpinRadius:60,
  hairpins:[{center:[-1800,-570],from:160,to:175},{center:[-1900,-450],from:180,to:195},{center:[-1400,-330],from:203,to:190},{center:[-1500,-210],from:185,to:170}],
  galleryProgress:[.39,.50]})
});

// A short easing ramp at each end joins road grades without a kink, while the
// middle keeps a realistic constant grade (a full smoothstep wastes slope budget).
const RAMP=.14;
function elevationEase(t){
 const area=1-RAMP;
 if(t<RAMP)return (t*t*t/(RAMP*RAMP)-t*t*t*t/(2*RAMP*RAMP*RAMP))/area;
 if(t>1-RAMP)return 1-elevationEase(1-t);
 return (t-RAMP*.5)/area;
}
class GradedLine extends THREE.Curve{
 constructor(a,b){super();this.a=new THREE.Vector3(...a);this.b=new THREE.Vector3(...b);this.arcLengthDivisions=120;}
 getPoint(t,target=new THREE.Vector3()){target.lerpVectors(this.a,this.b,t);target.y=THREE.MathUtils.lerp(this.a.y,this.b.y,elevationEase(t));return target;}
}
class GradedArc extends THREE.Curve{
 constructor(cx,cz,r,a,b,y0,y1){super();Object.assign(this,{cx,cz,r,a,b,y0,y1});this.arcLengthDivisions=160;}
 getPoint(t,target=new THREE.Vector3()){const angle=THREE.MathUtils.lerp(this.a,this.b,t);return target.set(this.cx+Math.cos(angle)*this.r,THREE.MathUtils.lerp(this.y0,this.y1,elevationEase(t)),this.cz+Math.sin(angle)*this.r);}
}
// Elevation follows horizontal arc length, independent of Bezier control-point
// speed. This prevents a short approach tangent from steepening the return ramp.
class GradedPlanarCurve extends THREE.Curve{
 constructor(curve,y0,y1,endGrade=0){super();Object.assign(this,{curve,y0,y1,endGrade});this.horizontalLength=curve.getLength();this.arcLengthDivisions=400;}
 getPoint(t,target=new THREE.Vector3()){this.curve.getPointAt(t,target);target.y=THREE.MathUtils.lerp(this.y0,this.y1,elevationEase(t))+this.endGrade*this.horizontalLength*(t*t*t-t*t);return target;}
}
class CurveSlice extends THREE.Curve{
 constructor(curve,from,to,length){super();Object.assign(this,{curve,from,to,length});}
 getPoint(t,target=new THREE.Vector3()){return this.curve.getPointAt(THREE.MathUtils.lerp(this.from,this.to,t),target);}
 getPointAt(t,target=new THREE.Vector3()){return this.getPoint(t,target);}
 getTangentAt(t,target=new THREE.Vector3()){return this.curve.getTangentAt(THREE.MathUtils.lerp(this.from,this.to,t),target);}
 getLength(){return (this.to-this.from)*this.length;}
}
class StationCurve extends THREE.Curve{
 constructor(parts){super();this.parts=parts;this.length=parts.at(-1).endS;}
 at(distance){const s=THREE.MathUtils.clamp(distance,0,this.length);let lo=0,hi=this.parts.length-1;while(lo<hi){const m=(lo+hi)>>1;if(s>this.parts[m].endS)lo=m+1;else hi=m;}const p=this.parts[lo];return [p,THREE.MathUtils.clamp((s-p.startS)/p.length,0,1)];}
 getPointAt(t,target=new THREE.Vector3()){const[p,u]=this.at(t*this.length);return p.curve.getPointAt(u,target);}
 getPoint(t,target=new THREE.Vector3()){return this.getPointAt(t,target);}
 getTangentAt(t,target=new THREE.Vector3()){const[p,u]=this.at((t===1?0:t)*this.length);return p.curve.getTangentAt(u,target);}
 getTangent(t,target=new THREE.Vector3()){return this.getTangentAt(t,target);}
 getLength(){return this.length;}
}

export function createChinaRoute(legacyCurve,legacyLength){
 const parts=[],sections=[];let station=0;
 const add=(id,curve)=>{const length=curve.getLength(),part={id,curve,startS:station,endS:station+length,length};parts.push(part);station+=length;return part;};
 const group=(id,build,extra={})=>{const startS=station;build();const section={id,startS,endS:station,...extra,length:station-startS};sections.push(section);return section;};
 const line=(id,a,b)=>add(id,new GradedLine(a,b));
 const arc=(id,cx,cz,r,a,b,y0,y1)=>add(id,new GradedArc(cx,cz,r,a,b,y0,y1));
 add('legacy',new CurveSlice(legacyCurve,0,.89,legacyLength));const extensionStartS=station;
 const exit=legacyCurve.getPointAt(.89),exitTangent=legacyCurve.getTangentAt(.89),returnPoint=legacyCurve.getPointAt(.993),returnTangent=legacyCurve.getTangentAt(.993);
 group('connector',()=>add('sea-approach',new THREE.CubicBezierCurve3(exit,exit.clone().addScaledVector(exitTangent,370),new THREE.Vector3(-200,45,-1450),new THREE.Vector3(...CHINA_ROUTE_LAYOUT.hzmb.start))),{kind:'sea-approach',elevated:true});
 group('hzmb',()=>line('hzmb',CHINA_ROUTE_LAYOUT.hzmb.start,CHINA_ROUTE_LAYOUT.hzmb.end),{region:'HONG KONG-ZHUHAI-MACAO BRIDGE',...CHINA_ROUTE_LAYOUT.hzmb,elevated:true});
 group('connector',()=>{arc('island-connector-turn-1',-3600,-1340,110,-Math.PI/2,-Math.PI,45,52);line('island-connector-climb',[-3710,52,-1340],[-3710,66,-740]);arc('island-connector-turn-2',-3600,-740,110,Math.PI,Math.PI/2,66,70);line('valley-approach',[-3600,70,-630],CHINA_ROUTE_LAYOUT.sichuan.start);},{kind:'island-to-valley',elevated:true});
 group('sichuan',()=>line('sichuan',CHINA_ROUTE_LAYOUT.sichuan.start,CHINA_ROUTE_LAYOUT.sichuan.end),{region:'WESTERN SICHUAN VIADUCT',...CHINA_ROUTE_LAYOUT.sichuan,elevated:true});
 group('duku',()=>{
  line('duku-first-ascent',[-2250,145,-630],[-1800,160,-630]);
  arc('duku-hairpin-1',-1800,-570,60,-Math.PI/2,Math.PI/2,160,175);
  line('duku-shelf-1',[-1800,175,-510],[-1900,180,-510]);
  arc('duku-hairpin-2',-1900,-450,60,-Math.PI/2,-Math.PI*1.5,180,195);
  line('duku-high-ascent',[-1900,195,-390],[-1400,203,-390]);
  arc('duku-hairpin-3',-1400,-330,60,-Math.PI/2,Math.PI/2,203,190);
  line('duku-shelf-2',[-1400,190,-270],[-1500,185,-270]);
  arc('duku-hairpin-4',-1500,-210,60,-Math.PI/2,-Math.PI*1.5,185,170);
  line('duku-descent',[-1500,170,-150],CHINA_ROUTE_LAYOUT.duku.end);
 },{region:'DUKU HIGHWAY',...CHINA_ROUTE_LAYOUT.duku});
 group('connector',()=>{
  const planar=new THREE.CubicBezierCurve3(new THREE.Vector3(...CHINA_ROUTE_LAYOUT.duku.end).setY(0),new THREE.Vector3(-480,0,-150),returnPoint.clone().addScaledVector(returnTangent,-410).setY(0),returnPoint.clone().setY(0));
  add('coastal-return',new GradedPlanarCurve(planar,CHINA_ROUTE_LAYOUT.duku.end[1],returnPoint.y,returnTangent.y/Math.hypot(returnTangent.x,returnTangent.z)));
 },{kind:'coastal-return'});
 const extensionEndS=station;add('legacy',new CurveSlice(legacyCurve,.993,1,legacyLength));
 return {curve:new StationCurve(parts),parts,sections,extensionStartS,extensionEndS,legacyExitS:legacyLength*.89,legacyReturnS:legacyLength*.993};
}
