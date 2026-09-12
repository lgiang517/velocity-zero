import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DriveAudio} from '../src/audio.js';
function harness(){
 const nodes=[];const param=()=>({value:0,setTargetAtTime(){}});const gain=()=>({gain:param(),connect(){},disconnect(){}});
 const a=new DriveAudio();a.ready=true;a.enabled=true;a.master=gain();a.musicBus=gain();a.startBuffer={duration:5};
 a.ctx={currentTime:0,resume:async()=>{},createGain:gain,createBufferSource:()=>{const n={started:0,stopped:0,connect(){},disconnect(){},start(){this.started++;},stop(){this.stopped++;this.onended?.();}};nodes.push(n);return n;}};
 return {a,nodes};
}
test('five-second cue has safe peak, quiet tail, and exact duration',()=>{
 const b=fs.readFileSync(new URL('../public/audio/engine/ferrari-start-5s.wav',import.meta.url));let data,rate,channels;
 for(let i=12;i+8<=b.length;){const id=b.toString('ascii',i,i+4),n=b.readUInt32LE(i+4);if(id==='fmt '){channels=b.readUInt16LE(i+10);rate=b.readUInt32LE(i+12);assert.equal(b.readUInt16LE(i+22),16);}if(id==='data')data=b.subarray(i+8,i+8+n);i+=8+n+(n%2);}
 assert.ok(data);assert.equal(data.length/(rate*channels*2),5);let peak=0,power=0,tail=0;
 for(let i=0;i<data.length;i+=2){const x=data.readInt16LE(i)/32768;peak=Math.max(peak,Math.abs(x));power+=x*x;if(i>data.length-rate*.05*2)tail+=x*x;}
 assert.ok(peak<.5);assert.ok(Math.sqrt(power/(data.length/2))<.1);assert.ok(Math.sqrt(tail/(rate*.05))<.005);
});
test('new race plays one non-looping recording; throttle never retriggers',async()=>{
 const {a,nodes}=harness();await a.playStart();assert.equal(nodes.length,1);assert.equal(nodes[0].loop,false);assert.equal(nodes[0].buffer.duration,5);assert.equal(a.startSource.gain.gain.value,.40*.65);
 for(let i=0;i<1200;i++)a.update({throttle:i%2,rpm:6500},null,[],false,0);assert.equal(nodes.length,1);
});
test('pause and mute cancel a current or asynchronously loading start',async()=>{
 const {a,nodes}=harness();await a.playStart();a.stopStart();assert.equal(nodes[0].stopped,1);assert.equal(a.startSource,null);
 a.startBuffer=null;let finish;a.loadStart=()=>new Promise(resolve=>finish=resolve);const pending=a.playStart();a.stopStart();finish({duration:5});await pending;assert.equal(nodes.length,1);
 a.startBuffer={duration:5};await a.playStart();a.setEnabled(false);assert.equal(nodes[1].stopped,1);assert.equal(a.startSource,null);
});
test('restarting replaces prior cue; stale completion cannot clear new cue',async()=>{
 const {a,nodes}=harness();await a.playStart();await a.playStart();assert.equal(nodes[0].stopped,1);assert.equal(nodes.length,2);nodes[0].onended();assert.equal(a.startSource.source,nodes[1]);nodes[1].onended();assert.equal(a.startSource,null);
});
