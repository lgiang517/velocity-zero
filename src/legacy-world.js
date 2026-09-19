/** Keep established coastal scenery tied to its original metric route. */
export function legacySceneWorld(world){
 if(!world.track.legacyTrack)return world;
 return new Proxy(world,{get(target,key,receiver){return key==='track'?target.track.legacyTrack:Reflect.get(target,key,receiver);},set(target,key,value){return Reflect.set(target,key,value);}});
}
