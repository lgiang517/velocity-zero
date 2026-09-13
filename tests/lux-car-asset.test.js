import test from 'node:test';
import fs from 'node:fs';
import {validateLuxCar} from '../tools/validate-lux-car.mjs';
const path=new URL('../public/models/solstice-lux-gt.glb',import.meta.url);
test('actual Lux GT GLB satisfies mesh, glass, plate, wheel and texture contracts',{skip:!fs.existsSync(path)&&'Lux GT export not ready'},()=>{validateLuxCar(path);});

test('actual window centers have no opaque inner paint shell and cabin floor remains closed',{skip:!fs.existsSync(path)&&'Lux GT export not ready'},async()=>{
 const {cabinRayReport}=await import('../tools/validate-lux-car.mjs');const {default:assert}=await import('node:assert/strict');const rays=cabinRayReport(validateLuxCar(path));
 for(const window of rays.windows){assert.equal(window.hits[0]?.material,'Window glass',`${window.name}: opaque shell blocks the glazing center`);}
 for(const ray of rays.vertical){assert.ok(ray.hit,'Cabin vertical ray must hit shell');assert.ok(ray.direction<0?ray.hit.point[1]>.20:ray.hit.point[1]>1.08,'Closed floor and head clearance');if(ray.direction<0)assert.notEqual(ray.hit.material,'Window glass');}
});

test('continuous hood and glazing cover their inset panel footprints',{skip:!fs.existsSync(path)&&'Lux GT export not ready'},async()=>{
 const {panelCoverageReport}=await import('../tools/validate-lux-car.mjs');const {default:assert}=await import('node:assert/strict');
 // These five panels are continuous surfaces; keep away from intentional perimeter gaps.
 // This samples only the inner footprint and does not assert global mesh watertightness.
 for(const panel of panelCoverageReport(validateLuxCar(path))){assert.ok(panel.sampled>0);assert.equal(panel.misses.length,0,`${panel.name}: holes at ${JSON.stringify(panel.misses.slice(0,4))}`);}
});

test('driver bonnet remains below the fixed eye for every model height scale',{skip:!fs.existsSync(path)&&'Lux GT export not ready'},async()=>{
 const {driverHoodVisibilityReport}=await import('../tools/validate-lux-car.mjs');const {default:assert}=await import('node:assert/strict');
 for(const car of driverHoodVisibilityReport(validateLuxCar(path))){assert.ok(car.vertices>0);assert.equal(car.aboveEye,0,`${car.id}: ${car.aboveEye} bonnet vertices above fixed eye ${car.eyeY}, maxY=${car.maxY}`);}
});
