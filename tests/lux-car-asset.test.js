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
 // These panels, including the opaque roof, are continuous surfaces; keep away from intentional perimeter gaps.
 // This samples only the inner footprint and does not assert global mesh watertightness.
 for(const panel of panelCoverageReport(validateLuxCar(path))){assert.ok(panel.sampled>0);assert.equal(panel.misses.length,0,`${panel.name}: holes at ${JSON.stringify(panel.misses.slice(0,4))}`);}
});

test('driver bonnet remains below the fixed eye for every model height scale',{skip:!fs.existsSync(path)&&'Lux GT export not ready'},async()=>{
 const {driverHoodVisibilityReport}=await import('../tools/validate-lux-car.mjs');const {default:assert}=await import('node:assert/strict');
 for(const car of driverHoodVisibilityReport(validateLuxCar(path))){assert.ok(car.vertices>0);assert.equal(car.aboveEye,0,`${car.id}: ${car.aboveEye} bonnet vertices above fixed eye ${car.eyeY}, maxY=${car.maxY}`);}
});


test('opaque canopy is visible from above with the actual FrontSide winding',async()=>{
 const {panelCoverageReport}=await import('../tools/validate-lux-car.mjs');const {default:assert}=await import('node:assert/strict');
 const roof=panelCoverageReport(validateLuxCar(path),{backfaceCulling:true}).find(p=>p.name==='Unified canopy roof');
 assert.ok(roof&&roof.sampled>100,'Roof footprint must be sampled');assert.equal(roof.misses.length,0,'Opaque roof cannot rely on DoubleSide rendering');
});

test('boot lid covers the rear compartment from the chase-camera side',async()=>{
 const {rearDeckCoverageReport}=await import('../tools/validate-lux-car.mjs');const {default:assert}=await import('node:assert/strict');
 const deck=rearDeckCoverageReport(validateLuxCar(path));assert.equal(deck.sampled,117);
 assert.equal(deck.failures.length,0,`Open trunk or inward top faces: ${JSON.stringify(deck.failures.slice(0,8))}`);
});

test('rear fascia hides the inner wheel and cabin cavity in the actual render winding',async()=>{
 const {rearFasciaCoverageReport}=await import('../tools/validate-lux-car.mjs');const {default:assert}=await import('node:assert/strict');
 const fascia=rearFasciaCoverageReport(validateLuxCar(path));assert.equal(fascia.sampled,117);
 assert.equal(fascia.failures.length,0,`Open rear fascia: ${JSON.stringify(fascia.failures.slice(0,8))}`);
});
