import {buildNeighborhoodPaths} from './neighborhood-paths.js';
import {buildNeighborhoodProps} from './neighborhood-props.js';
import {buildNeighborhoodPeople} from './neighborhood-people.js';
export function buildNeighborhood(world,sites){
 const paths=buildNeighborhoodPaths(world,sites);world.neighborhoodPaths=paths;
 const props=buildNeighborhoodProps(world,sites),people=buildNeighborhoodPeople(world,paths);
 const stats={paths:paths.stats,props:props.stats,people:people.stats};
 return {paths,stats,update(camera,time,quality){props.update(camera,quality);people.update(camera,time,quality);}};
}
