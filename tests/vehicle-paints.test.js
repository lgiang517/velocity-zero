import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePaint,restorePaintSelections} from '../src/vehicle-paints.js';
test('retired shared paint migrates to the selected model default',()=>{
 const saved=restorePaintSelections({car:'f812',paint:'#e85824'});
 assert.equal(saved.f812,resolvePaint('f812').color);
 assert.equal(saved.db12,resolvePaint('db12').color);
});
test('per-car preferences override legacy paint without leaking across models',()=>{
 const saved=restorePaintSelections({car:'db12',paint:'#a51930',paints:{db12:'silver-birch',f812:'rosso-corsa'}});
 assert.equal(saved.db12,'#b6b9b1');assert.equal(saved.f812,'#d01820');assert.equal(saved.gtc4lusso,'#b91c25');
 assert.equal(resolvePaint('db12','rosso-corsa').id,'iridescent-emerald');
});
test('legacy valid paint is retained and malformed settings use defaults',()=>{
 assert.equal(restorePaintSelections({car:'gtc4lusso',paint:'#e8e8e0'}).gtc4lusso,'#e8e8e0');
 assert.deepEqual(restorePaintSelections(null),restorePaintSelections());
});
