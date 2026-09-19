import test from 'node:test';
import assert from 'node:assert/strict';
import {DriveAudio} from '../src/audio.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(t){
 const previousWindow=globalThis.window,previousAudio=globalThis.Audio,nodes=[];
 const parameter=()=>({value:1,target:null,events:[],setTargetAtTime(value,time,constant){this.target=value;this.events.push({type:'target',value,time,constant});},setValueAtTime(value,time){this.value=value;this.events.push({type:'set',value,time});},exponentialRampToValueAtTime(value,time){this.events.push({type:'ramp',value,time});}});
 function node(kind,extra={}){const n={kind,connections:[],connect(destination){this.connections.push(destination);return destination;},disconnect(){this.connections=[];},...extra};nodes.push(n);return n;}
 class Context{
  constructor(){this.currentTime=2;this.state='running';this.sampleRate=44100;this.destination=node('destination');}
  resume(){this.state='running';return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}
  createGain(){return node('gain',{gain:parameter()});}
  createDynamicsCompressor(){return node('compressor',{threshold:parameter(),ratio:parameter()});}
  createMediaElementSource(element){return node('media',{element});}
  createBuffer(channels,length,rate){return{duration:length/rate,getChannelData:()=>new Float32Array(length)};}
  createBufferSource(){return node('buffer',{start(){this.started=true;},stop(){this.onended?.();}});}
  decodeAudioData(){throw Error('Music must remain streamed, not decoded into PCM');}
 }
 class Media{
  constructor(){this.paused=true;this.currentTime=0;this.plays=0;Object.defineProperty(this,'volume',{get:()=>1,set(){throw Error('Do not rely on HTMLMediaElement.volume on mobile');}});}
  setAttribute(){}removeAttribute(){this.src='';}load(){}play(){this.paused=false;this.plays++;return Promise.resolve();}pause(){this.paused=true;}
 }
 globalThis.window={AudioContext:Context};globalThis.Audio=Media;
 t.after(()=>{globalThis.window=previousWindow;globalThis.Audio=previousAudio;});
 const audio=new DriveAudio();audio.startBuffer={duration:5};
 // Follow the actual connections created by init/loadMusic, so a disconnected
 // trim or accidental compressor/master bypass cannot pass a gain-only test.
 function paths(from,to,path=[]){assert.ok(!path.includes(from),'audio graph must be acyclic');const next=[...path,from];return from===to?[next]:from.connections.flatMap(n=>paths(n,to,next));}
 function output(from){const all=paths(from,audio.ctx.destination);return all.reduce((sum,path)=>sum+path.reduce((gain,n)=>gain*(n.gain?(n.gain.target??n.gain.value):1),1),0);}
 return{audio,nodes,paths,output};
}

test('real initialization has one music-only path, default 28% output and an 80% ceiling',async t=>{
 const {audio:a,nodes,paths,output}=harness(t);await a.init();await tick();
 assert.equal(a.musicVolume,.35);assert.equal(output(a.musicMediaNode),0,'gesture priming remains silent before a race');
 assert.deepEqual(paths(a.musicMediaNode,a.ctx.destination),[[a.musicMediaNode,a.musicGain,a.musicBus,a.master,a.ctx.destination]]);
 assert.equal(nodes.filter(n=>n.kind==='compressor').length,1);assert.ok(paths(a.musicMediaNode,a.ctx.destination).every(path=>!path.includes(a.compressor)));
 for(const [slider,expected]of[[0,0],[.35,.28],[.65,.52],[1,.8],[9,.8],[-1,0],[NaN,0]]){
  a.musicVolume=slider;a.update({},null,[],true,0);assert.ok(Math.abs(output(a.musicMediaNode)-expected)<1e-12);
  assert.ok(Math.abs(a.getMixState().outputTarget-expected)<1e-12);assert.equal(a.getMixState().muted,expected===0);assert.equal(a.master.gain.target,.4);
 }
 assert.ok(output(a.musicMediaNode)<=.8);assert.equal(a.getMixState().maxOutputGain,.8);await a.dispose();
});

test('the louder music still reaches zero for pause/menu/mute and preserves a saved zero slider',async t=>{
 const {audio:a,output}=harness(t);await a.init();a.musicVolume=1;a.update({},null,[],true,0);await tick();assert.equal(output(a.musicMediaNode),.8);
 a.pauseMusic();assert.equal(output(a.musicMediaNode),0);assert.equal(a.getMixState().muted,true);assert.equal(a.musicElement.paused,true);
 a.update({},null,[],true,0);a.update({},null,[],false,0);assert.equal(output(a.musicMediaNode),0,'menu output');
 a.update({},null,[],true,0);a.setEnabled(false);assert.equal(output(a.musicMediaNode),0);const plays=a.musicElement.plays;await a.resumeFromGesture();assert.equal(a.musicElement.plays,plays);assert.equal(a.enabled,false);
 a.setMusicTrack('wan-dao-yin-qing');assert.equal(output(a.musicMediaNode),0);assert.equal(a.musicElement.plays,plays);
 a.musicVolume=0;a.setEnabled(true);a.update({},null,[],true,0);await tick();assert.equal(a.musicVolume,0);assert.equal(output(a.musicMediaNode),0);assert.equal(a.getMixState().outputTarget,0);await a.dispose();
});

test('changing music gain/track leaves ignition and the existing effects master unchanged',async t=>{
 const {audio:a,paths,output}=harness(t);await a.init();a.update({},null,[],true,0);await a.playStart();
 const source=a.startSource.source,gain=a.startSource.gain;
 assert.deepEqual(paths(source,a.ctx.destination),[[source,gain,a.master,a.ctx.destination]]);
 assert.ok(Math.abs(output(source)-.104)<1e-12);assert.equal(gain.gain.value,.40*.65);
 assert.deepEqual(a.compressor.connections,[a.master]);assert.equal(a.compressor.threshold.value,-15);assert.equal(a.compressor.ratio.value,7);
 a.musicVolume=1;a.update({},null,[],true,0);assert.equal(output(a.musicMediaNode),.8);assert.ok(Math.abs(output(source)-.104)<1e-12);
 a.setMusicTrack('wan-dao-yin-qing');a.update({},null,[],true,0);await tick();assert.equal(output(a.musicMediaNode),.8);assert.ok(Math.abs(output(source)-.104)<1e-12);assert.equal(a.startSource.source,source);await a.dispose();
});
