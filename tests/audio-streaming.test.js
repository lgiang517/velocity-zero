import test from 'node:test';import assert from 'node:assert/strict';import {DriveAudio} from '../src/audio.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(t){
 const old=globalThis.Audio,nodes=[];class Media{constructor(){this.paused=true;this.currentTime=0;this.loads=0;this.plays=0;this.listeners={};}setAttribute(){}removeAttribute(){this.src='';}load(){this.loads++;}play(){this.plays++;this.paused=false;return this.nextPlay||Promise.resolve();}pause(){this.paused=true;}}
 globalThis.Audio=Media;t.after(()=>{globalThis.Audio=old;});
 const param=()=>({value:0,setTargetAtTime(){}}),gain=()=>({gain:param(),connect(){},disconnect(){this.disconnected=true;}});
 const a=new DriveAudio();a.ready=true;a.enabled=true;a.master=gain();a.musicBus=gain();a.ctx={state:'running',currentTime:0,sampleRate:44100,destination:{},resume(){return Promise.resolve();},close(){return Promise.resolve();},createGain:gain,createMediaElementSource(element){const n={element,connect(){},disconnect(){this.disconnected=true;}};nodes.push(n);return n;},createBuffer(){return{};},createBufferSource(){return{connect(){},start(){},disconnect(){}};},decodeAudioData(){throw Error('Music must never allocate decoded PCM');}};
 return {a,nodes};
}
test('music streams through one shared media node with unchanged gain and no PCM decode',async t=>{
 const {a,nodes}=fixture(t);await a.loadMusic();const e=a.musicElement;await a.loadMusic();assert.equal(nodes.length,1);assert.equal(e.loads,1);assert.equal(a.musicGain.gain.value,.72);assert.ok(e.src.endsWith('edm-detection-mode-kevin-macleod.mp3'));a.updateMusic(true);await tick();assert.equal(e.paused,false);assert.ok(a.musicSource);await a.dispose();assert.equal(nodes[0].disconnected,true);assert.equal(e.src,'');
});
test('a pending context resume does not delay streaming play in the user gesture',async t=>{
 const {a}=fixture(t);a.ctx.state='suspended';a.ctx.resume=()=>new Promise(()=>{});void a.resumeFromGesture();assert.equal(a.musicElement.plays,1);assert.equal(a.musicStatus,'loading');await tick();assert.equal(a.musicElement.paused,true,'silent unlock ends when not racing');await a.dispose();
});
test('pause retains stream position, restart seeks zero, and mute stops playback',async t=>{
 const {a}=fixture(t);await a.loadMusic();a.updateMusic(true);await tick();a.musicElement.currentTime=37.4;a.pauseMusic();assert.equal(a.musicElement.currentTime,37.4);a.updateMusic(true);await tick();assert.equal(a.musicElement.currentTime,37.4);a.resetMusic();assert.equal(a.musicElement.currentTime,0);a.updateMusic(true);await tick();a.setEnabled(false);assert.equal(a.musicElement.paused,true);assert.equal(a.musicSource,null);await a.dispose();
});
test('late play completion after pause/dispose cannot publish a playing source',async t=>{
 const {a}=fixture(t);await a.loadMusic();let resolve;a.musicElement.nextPlay=new Promise(r=>resolve=r);a.updateMusic(true);a.pauseMusic();resolve();await tick();assert.equal(a.musicSource,null);let finish;a.musicElement.nextPlay=new Promise(r=>finish=r);a.updateMusic(true);await a.dispose();finish();await tick();assert.equal(a.musicSource,null);assert.equal(a.musicElement,null);
});
test('network failure retries on a new audio gesture without replacing the media node',async t=>{
 const {a,nodes}=fixture(t);await a.loadMusic();const e=a.musicElement;e.onerror();assert.equal(a.musicStatus,'unavailable');await a.resumeFromGesture();await tick();assert.equal(e.loads,2);assert.equal(nodes.length,1);assert.equal(a.musicStatus,'ready');await a.dispose();
});
test('blocked media playback is caught and a later explicit gesture can recover',async t=>{
 const {a}=fixture(t);await a.loadMusic();const e=a.musicElement;e.nextPlay=Promise.reject(Object.assign(Error('gesture required'),{name:'NotAllowedError'}));a.updateMusic(true);await tick();assert.equal(a.musicStatus,'blocked');const count=e.plays;a.updateMusic(true);assert.equal(e.plays,count);e.nextPlay=Promise.resolve();await a.resumeFromGesture();await tick();assert.equal(a.musicStatus,'ready');assert.ok(a.musicSource);await a.dispose();
});

test('race reset does not abort the first gesture play while stream data is pending',async t=>{
 const {a}=fixture(t);await a.loadMusic();let finish;const e=a.musicElement;e.nextPlay=new Promise(r=>finish=r);void a.resumeFromGesture();a.resetMusic();assert.equal(e.paused,false);assert.equal(a.musicPriming,true);a.updateMusic(true);finish();await tick();assert.ok(a.musicSource);assert.equal(e.paused,false);await a.dispose();
});

test('ignition loading works without AbortSignal.timeout and retries a failed request',async t=>{
 const {a}=fixture(t),originalFetch=globalThis.fetch,originalTimeout=AbortSignal.timeout,originalWarn=console.warn;
 t.after(()=>{globalThis.fetch=originalFetch;AbortSignal.timeout=originalTimeout;console.warn=originalWarn;});AbortSignal.timeout=undefined;console.warn=()=>{};let attempts=0;
 globalThis.fetch=async(_url,options)=>{assert.ok(options.signal);attempts++;if(attempts===1)throw Error('offline');return{ok:true,arrayBuffer:async()=>new ArrayBuffer(4)};};
 a.ctx.decodeAudioData=(_bytes,success)=>{success({duration:5});};assert.equal(await a.loadStart(),null);assert.equal(a.startPromise,null);assert.equal((await a.loadStart()).duration,5);assert.equal(attempts,2);await a.dispose();
});

test('resume gesture while muted never unmutes or starts the stream',async t=>{
 const {a}=fixture(t);await a.loadMusic();a.updateMusic(true);await tick();a.setEnabled(false);const e=a.musicElement,plays=e.plays;let resumes=0;a.ctx.resume=()=>{resumes++;return Promise.resolve();};
 await a.resumeFromGesture();assert.equal(a.enabled,false);assert.equal(e.plays,plays);assert.equal(resumes,0);assert.equal(e.paused,true);
 a.setEnabled(true);a.updateMusic(true);await tick();assert.equal(a.enabled,true);assert.equal(e.plays,plays+1);assert.ok(a.musicSource);await a.dispose();
});

test('canplay and later network events cannot erase a gesture-required block',async t=>{
 const {a}=fixture(t);await a.loadMusic();const e=a.musicElement;e.nextPlay=Promise.reject(Object.assign(Error('activation required'),{name:'NotAllowedError'}));a.updateMusic(true);await tick();e.paused=true;
 e.oncanplay();assert.equal(a.musicStatus,'blocked');e.onerror();assert.equal(a.musicStatus,'blocked');const attempts=e.plays;
 for(let i=0;i<120;i++)a.update({},null,[],true,0);assert.equal(e.plays,attempts);
 e.nextPlay=Promise.resolve();await a.resumeFromGesture();await tick();assert.equal(a.musicStatus,'ready');assert.equal(a.musicPlaybackBlocked,false);await a.dispose();
});

test('automatic network retries have a finite budget even if canplay fires between failures',async t=>{
 const {a}=fixture(t);await a.loadMusic();const e=a.musicElement;
 // A permanent stream failure stays paused; load can emit canplay before playback fails.
 e.play=()=>{e.plays++;return Promise.reject(Object.assign(Error('network'),{name:'NotSupportedError'}));};
 e.onerror();assert.equal(a.musicFailures,1);for(let failure=1;failure<3;failure++){
  a.musicRetryAt=0;a.update({},null,[],true,0);e.oncanplay();assert.equal(a.musicFailures,failure);a.updateMusic(true);await tick();assert.equal(a.musicFailures,failure+1);
 }
 const loads=e.loads,plays=e.plays;e.oncanplay();assert.equal(a.musicStatus,'unavailable');a.musicRetryAt=0;for(let i=0;i<120;i++)a.update({},null,[],true,0);assert.equal(e.loads,loads);assert.equal(e.plays,plays);
 // Explicit new activation permits one fresh recovery attempt after the automatic budget.
 e.play=()=>{e.plays++;e.paused=false;return Promise.resolve();};await a.resumeFromGesture();await tick();assert.equal(a.musicFailures,0);assert.equal(a.musicStatus,'ready');assert.equal(e.loads,loads+1);await a.dispose();
});
