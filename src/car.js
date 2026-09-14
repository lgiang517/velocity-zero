import {IMPORTED_MODELS,loadImportedCar,createImportedCar} from './imported-car.js';

// Only the authored vehicle roster is available to the game.
export async function loadCarModel(config){
 if(!IMPORTED_MODELS[config.id])throw new Error('Unsupported vehicle: '+config.id);
 await loadImportedCar(config.id);
}
export async function loadCarModels(){
 // Preload the default, patrol and traffic models before a race can start.
 // The additional 812 is loaded only when selected.
 await Promise.all(['db12','gtc4lusso'].map(loadImportedCar));
}
export function createCar(config,color='#e85824',simple=false){
 if(!IMPORTED_MODELS[config.id])throw new Error('Unsupported vehicle: '+config.id);
 return createImportedCar(config,color,simple);
}
