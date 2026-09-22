import {buildNeighborhoodPaths} from './neighborhood-paths.js';
import {buildNeighborhoodProps} from './neighborhood-props.js';
export function buildNeighborhood(world,sites){
 const paths=buildNeighborhoodPaths(world,sites);world.neighborhoodPaths=paths;
 const props=buildNeighborhoodProps(world,sites);
 // Retain the telemetry shape while omitting resident meshes, shadows and updates.
 const people={routes:0,residents:0,active:0,maxActive:0,drawCalls:0,triangles:0,matrixUpdates:0,shadowCasters:false};
 const stats={paths:paths.stats,props:props.stats,people};
 return {paths,stats,update(camera,time,quality){props.update(camera,quality);}};
}
