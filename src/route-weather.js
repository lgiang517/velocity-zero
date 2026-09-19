const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
// Quintic interpolation makes both boundary velocity and acceleration zero.
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*t*(t*(t*6-15)+10);};
const envelope=(x,a,b,c,d)=>smooth(a,b,x)*(1-smooth(c,d,x));
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
const BASE_WEATHER=Object.freeze({
 clear:{wet:0,night:0,fog:.00058,cloud:.10,temperature:24,label:'晴朗'},
 sunset:{wet:0,night:0,fog:.00058,cloud:.14,temperature:19,label:'夕照'},
 night:{wet:0,night:1,fog:.00058,cloud:.12,temperature:14,label:'夜色'},
 rain:{wet:.7,night:0,fog:.00058,cloud:.75,temperature:17,label:'阵雨'},
 storm:{wet:1,night:.55,fog:.002,cloud:.95,temperature:13,label:'暴雨'},
 fog:{wet:0,night:0,fog:.004,cloud:.58,temperature:16,label:'雾天'},
 dynamic:{wet:0,night:0,fog:.00058,cloud:.18,temperature:19,label:'多变天气'}
});
export const ROUTE_WEATHER_TUNING=Object.freeze({minTransitionMetres:150,maxTransitionMetres:240,wetResponse:.45,atmosphereResponse:.7,temperatureResponse:.4,maxMountainWet:.48,maxMountainFog:.00265});
/**
 * Pure targets for the independent G217 mountain microclimate. No state, DOM,
 * geometry, randomness or track.sample calls; only one small result is allocated.
 *
 * baseWeather: manual mode string, or {mode,wet,night,fog,cloud,temperature}.
 * Explicit numeric base fields win, useful when the caller computes dynamic sky.
 * time: elapsed simulation seconds; freeze it when paused.
 *
 * Result units: weight/cloud/wet/snow/night/rain [0..1], fog m^-1 for FogExp2,
 * temperature degrees Celsius, daylightScale [0.68..1] for light INTENSITY only.
 * cloud/wet/fog/night are ABSOLUTE targets, not multipliers or additive deltas.
 * A caller should damp these targets; do not overwrite the selected weather mode.
 * snow is precipitation appearance, not snow cover or an extra traction penalty.
 */
export function sampleRouteWeather(track,s,baseWeather='sunset',time=0){
 const input=baseWeather&&typeof baseWeather==='object'?baseWeather:null;
 const mode=typeof baseWeather==='string'?baseWeather:input?.mode||'sunset',base=BASE_WEATHER[mode]||BASE_WEATHER.sunset,t=finite(time,0);
 const dynamic=mode==='dynamic',baseWet=clamp(finite(input?.wet,dynamic?clamp(Math.sin(t/60)*.9):base.wet));
 const baseNight=clamp(finite(input?.night,dynamic?(Math.sin(t/110-.8)+1)*.42:base.night));
 const baseFog=Math.max(0,finite(input?.fog,base.fog)),baseCloud=clamp(finite(input?.cloud,dynamic?Math.max(.18,baseWet*.85):base.cloud)),baseTemperature=finite(input?.temperature,base.temperature);
 const section=track?.section?.('duku'),routeLength=finite(track?.length,0),valid=section&&Number.isFinite(section.startS)&&Number.isFinite(section.endS)&&section.endS>section.startS&&routeLength>0&&Number.isFinite(s);
 const station=valid?(s>=0&&s<routeLength?s:((s%routeLength)+routeLength)%routeLength):0,length=valid?section.endS-section.startS:0,local=valid?station-section.startS:0;
 const inside=!!valid&&local>1e-7&&local<length-1e-7,progress=valid?clamp(local/length):0;
 const transition=valid?clamp(length*.08,ROUTE_WEATHER_TUNING.minTransitionMetres,ROUTE_WEATHER_TUNING.maxTransitionMetres):ROUTE_WEATHER_TUNING.minTransitionMetres;
 const weight=inside?smooth(0,transition,local)*(1-smooth(length-transition,length,local)):0;
 if(weight===0)return{active:false,weight:0,progress,cloud:baseCloud,wet:baseWet,fog:baseFog,snow:0,rain:baseWet,night:baseNight,daylightScale:1,temperature:baseTemperature,label:base.label,stage:'base',transitionMetres:transition};
 // The actual route's high straight and pass occupy approximately 39–62%.
 // Mist forms on approach, sleet crosses the high pass, then clouds break during
 // descent. Route position supplies the large changes; slow drift stays small.
 const cloudBand=envelope(progress,.10,.35,.69,.91),mist=envelope(progress,.20,.39,.62,.84);
 const precipitation=envelope(progress,.35,.49,.62,.78),snowBand=envelope(progress,.41,.54,.63,.73),cold=envelope(progress,.12,.51,.63,.91);
 const drift=1+.045*Math.sin(t/43+progress*3.1)+.025*Math.sin(t/79-progress*4.2);
 const mountainCloud=clamp(.08+cloudBand*.77*drift),mountainWet=Math.min(ROUTE_WEATHER_TUNING.maxMountainWet,precipitation*.445*drift);
 const mountainFog=.00058+mist*.00160*drift+precipitation*.00034;
 const cloud=Math.max(baseCloud,mix(baseCloud,mountainCloud,weight)),wet=Math.max(baseWet,mix(baseWet,mountainWet,weight)),fog=Math.max(baseFog,mix(baseFog,Math.min(ROUTE_WEATHER_TUNING.maxMountainFog,mountainFog),weight));
 const snow=clamp(snowBand*.72*drift*weight),rain=Math.max(baseWet,mountainWet*weight)*(1-snow*.46);
 const daylightScale=1-cloudBand*weight*.28;
 const peakTemperature=baseNight>.7?-.4:1.8,temperature=Math.min(baseTemperature,mix(baseTemperature,peakTemperature,cold*weight));
 let stage='valley',label=baseNight>.7?'夜色山谷':baseWet>.45?'山谷阵雨':baseFog>.003?'山谷雾气':'山谷晴间多云';
 if(progress>=.78){stage='clearing';label=baseNight>.7?'下山夜云渐散':baseWet>.45?'下山雨势延续':baseFog>.003?'下山雾气延续':'下山云开';}
 else if(snow>.18){stage='sleet';label='高山雨夹雪';}
 else if(mist>.12){stage='mist';label=baseWet>.45?'高台雨雾':'高台薄雾';}
 else if(progress>.18){stage='cloud';label='山云渐起';}
 return{active:true,weight,progress,cloud,wet,fog,snow,rain,night:baseNight,daylightScale,temperature,label,stage,transitionMetres:transition};
}
