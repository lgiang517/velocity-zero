import test from 'node:test';
import assert from 'node:assert/strict';
import {CoastTrack} from '../src/track.js';
import {SCENIC_SECTIONS,scenicSectionAt,elevatedSectionAt,westernValleyHeight} from '../src/scenic-sections.js';

test('legacy fractions remain archived while production chapters use metre-based locations',()=>{
 const legacy=new CoastTrack({legacy:true}),track=new CoastTrack();assert.ok(Math.abs(legacy.length-6873.779692794547)<1e-8);
 for(const[name,section]of Object.entries(SCENIC_SECTIONS)){
  assert.equal(scenicSectionAt((section.start+section.end)/2),name);
  const current=track.section(name),middle=(current.startS+current.endS)/2;
  for(const wrap of[-1,0,1])assert.equal(track.region(middle+wrap*track.length),section.region);
  assert.equal(track.inTunnel(middle),false);
 }
 assert.equal(track.region(legacy.length*.35),'KAZE MOUNTAIN PASS');
 assert.equal(elevatedSectionAt(.43),false);assert.equal(elevatedSectionAt(.35),true);assert.equal(elevatedSectionAt(.94),true);assert.equal(scenicSectionAt(.27),null);
});
test('viaduct canyon joins unchanged terrain smoothly and cannot carve neighbouring roads',()=>{
 for(const t of [.1,.305,.39,.7,.95])for(const d of [0,20,60,100])assert.equal(westernValleyHeight(180,t,d),180);
 assert.equal(westernValleyHeight(180,.35,0),116);assert.equal(westernValleyHeight(180,.35,20),116);
 assert.equal(westernValleyHeight(180,.35,82),180);assert.equal(westernValleyHeight(180,.35,100),180);
 for(const edge of [.31,.385])assert.ok(Math.abs(westernValleyHeight(180,edge-.000001,0)-westernValleyHeight(180,edge+.000001,0))<.00001);
 for(let d=0;d<100;d+=.2){const h=westernValleyHeight(180,.35,d);assert.ok(h>=116&&h<=180);assert.ok(Math.abs(h-westernValleyHeight(180,.35,d+.2))<.32);}
});
