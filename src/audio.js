export const MUSIC_TRACKS=[
 {id:'raving-energy',title:'Raving Energy (faster)',file:'raving-energy-car-dj.mp3'},
 {id:'cipher',title:'Cipher',file:'cipher-car-dj.mp3'},
];
// AbortSignal.timeout is absent in some otherwise WebAudio-capable mobile browsers.
async function fetchAudioBytes(url,timeout){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw new Error(`Audio HTTP ${response.status}`);return await response.arrayBuffer();}finally{clearTimeout(timer);}
}
function decodeAudio(context,bytes){return new Promise((resolve,reject)=>{const result=context.decodeAudioData(bytes,resolve,reject);result?.then(resolve,reject);});}
const audioBase=()=>import.meta.env?.BASE_URL||'/';
/** Licensed music, one-shot ignition and short event cues. No continuous engine audio. */
export class DriveAudio {
  constructor(){this.musicTrack=MUSIC_TRACKS[0].id;this.ready=false;this.enabled=false;this.volume=.65;this.musicVolume=.35;this.musicStatus='idle';this.musicPromise=null;this.musicElement=null;this.musicMediaNode=null;this.musicGain=null;this.musicPlayPending=null;this.musicPlayToken=0;this.musicPriming=false;this.musicPlaybackBlocked=false;this.audioStatus='idle';this.musicFailures=0;this.musicRetryAt=0;this.musicBuffer=null;this.musicSource=null;this.musicActive=false;this.musicOffset=0;this.musicStartedAt=0;this.startToken=0;this.startSource=null;this.startBuffer=null;this.startPromise=null;}
  async init(){
    if(this.ready){const resumed=this.resumeFromGesture();void this.loadMusic();void this.loadStart();await resumed;return;}
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    this.ctx=new AC();const a=this.ctx;
    this.master=a.createGain();this.master.gain.value=.4;this.master.connect(a.destination);
    this.compressor=a.createDynamicsCompressor();this.compressor.threshold.value=-15;this.compressor.ratio.value=7;this.compressor.connect(this.master);
    // Noise exists only as a reusable buffer for short collision cues.
    const noise=a.createBuffer(1,a.sampleRate*.5,a.sampleRate),data=noise.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    this.noise=noise;
    // Keep music out of the effects compressor to prevent collision-driven pumping.
    this.musicBus=a.createGain();this.musicBus.gain.value=0;this.musicBus.connect(this.master);
    this.ready=true;this.enabled=true;const resumed=this.resumeFromGesture();void this.loadMusic();void this.loadStart();await resumed;
  }
  // Call directly from a click/touch handler, before awaits or expensive race setup.
  resumeFromGesture(){
    if(!this.ready||!this.enabled)return Promise.resolve(false);
    const context=this.ctx;let resumed;
    if(!this.musicBuffer&&!this.musicPromise){this.musicFailures=0;void this.loadMusic();}
    try{
      resumed=context.resume();
      this.requestMusicPlayback(true);
      if(context.state==='suspended'||context.state==='interrupted'){
        const source=context.createBufferSource();source.buffer=context.createBuffer(1,1,context.sampleRate);
        source.connect(context.destination);source.onended=()=>source.disconnect();source.start();
      }
    }catch(error){this.audioStatus='blocked';return Promise.resolve(false);}
    return Promise.resolve(resumed).then(()=>{if(this.ctx!==context||!this.ready)return false;this.audioStatus=context.state||'running';return context.state==='running';},()=>{this.audioStatus='blocked';return false;});
  }
  loadStart(){
    if(this.startBuffer)return Promise.resolve(this.startBuffer);
    if(!this.ready)return Promise.resolve(null);
    if(this.startPromise)return this.startPromise;
    const context=this.ctx;
    this.startPromise=(async()=>{
      try{
        const buffer=await decodeAudio(context,await fetchAudioBytes(audioBase()+'audio/engine/ferrari-start-5s.wav',30000));
        if(this.ctx===context&&this.ready)this.startBuffer=buffer;
        return buffer;
      }catch(error){console.warn('Ignition cue unavailable; continuing silently.',error);return null;}
    })().finally(()=>{if(this.ctx===context)this.startPromise=null;});
    return this.startPromise;
  }
  // Called exactly once by startRace. Loading never blocks the countdown.
  async playStart(){
    this.stopStart();const token=this.startToken;
    if(!this.ready||!this.enabled)return;
    const buffer=this.startBuffer||await this.loadStart();
    if(!buffer||token!==this.startToken||!this.ready||!this.enabled)return;
    const source=this.ctx.createBufferSource(),gain=this.ctx.createGain();
    source.buffer=buffer;source.loop=false;gain.gain.value=.40*Math.max(0,Math.min(1,this.volume));
    source.connect(gain);gain.connect(this.master);this.startSource={source,gain};
    source.onended=()=>{source.disconnect();gain.disconnect();if(this.startSource?.source===source)this.startSource=null;};
    source.start();
  }
  // Pause/menu/mute must cancel both a current cue and a pending asynchronous start.
  stopStart(){
    this.startToken++;
    if(this.startSource){const {source,gain}=this.startSource;this.startSource=null;gain.gain.value=0;source.stop();source.disconnect();gain.disconnect();}
  }
  setMusicTrack(id){
    const next=MUSIC_TRACKS.find(track=>track.id===id)||MUSIC_TRACKS[0];
    if(next.id===this.musicTrack)return this.musicTrack;
    const wasActive=this.musicActive;this.pauseMusic();this.musicTrack=next.id;
    this.musicOffset=0;this.musicFailures=0;this.musicRetryAt=0;this.musicPlaybackBlocked=false;
    this.musicStatus=this.ready?'loading':'idle';
    if(this.musicElement){
      this.musicElement.onloadedmetadata=null;this.musicElement.src=audioBase()+'audio/'+next.file;
      this.musicElement.currentTime=0;this.musicElement.load();
      if(wasActive&&this.enabled){this.musicActive=true;void this.resumeFromGesture();}
    }
    return this.musicTrack;
  }
  // Reuse one media element/node when switching tracks; retain pause and mute state.
  // Stream the DJ track without allocating a full decoded music buffer.
  loadMusic(){
    if(!this.ready)return Promise.resolve(null);
    if(this.musicElement){if(this.musicStatus==='unavailable'){this.musicStatus='loading';this.musicElement.load();}return Promise.resolve(this.musicElement);}
    const Media=globalThis.Audio||globalThis.window?.Audio;if(!Media)return Promise.resolve(null);
    const context=this.ctx,element=new Media();this.musicElement=element;
    element.preload='auto';element.loop=true;element.playsInline=true;element.setAttribute?.('playsinline','');
    element.src=audioBase()+'audio/'+MUSIC_TRACKS.find(track=>track.id===this.musicTrack).file;
    this.musicMediaNode=context.createMediaElementSource(element);this.musicGain=context.createGain();this.musicGain.gain.value=.72;
    this.musicMediaNode.connect(this.musicGain);this.musicGain.connect(this.musicBus);this.musicStatus='loading';
    element.oncanplay=()=>{if(this.musicElement===element&&this.ready){if(!this.musicPlaybackBlocked&&this.musicFailures<3)this.musicStatus='ready';}};
    element.onerror=()=>{if(this.musicElement!==element||!this.ready)return;this.musicStatus=this.musicPlaybackBlocked?'blocked':'unavailable';this.musicFailures++;this.musicRetryAt=Date.now()+Math.min(15000,2000*2**(this.musicFailures-1));};
    element.load();return Promise.resolve(element);
  }
  // The first play() is made directly in the same user gesture as AudioContext.resume().
  // Its bus stays silent until racing; once primed, programmatic pause/resume keeps position.
  requestMusicPlayback(prime=false){
    const element=this.musicElement;if(!element||!this.ready||!this.enabled||this.musicPlayPending)return;
    if(this.musicPlaybackBlocked&&!prime)return;
    if(prime)this.musicPlaybackBlocked=false;
    const token=++this.musicPlayToken;this.musicPriming=prime;
    let playing;try{playing=element.play();}catch(error){this.musicPlaybackBlocked=error?.name==='NotAllowedError';this.musicStatus=this.musicPlaybackBlocked?'blocked':'unavailable';if(!this.musicPlaybackBlocked){this.musicFailures++;this.musicRetryAt=Date.now()+Math.min(15000,2000*2**(this.musicFailures-1));}this.musicPriming=false;return;}
    if(this.musicActive)this.musicSource={source:element,gain:this.musicGain};
    this.musicPlayPending=Promise.resolve(playing).then(()=>{
      if(token!==this.musicPlayToken)return;
      this.musicPlaybackBlocked=false;this.musicFailures=0;this.musicStatus='ready';if(!this.musicActive||!this.enabled){element.pause();this.musicSource=null;}
      else this.musicSource={source:element,gain:this.musicGain};
    },error=>{if(token===this.musicPlayToken&&error?.name!=='AbortError'){this.musicPlaybackBlocked=error?.name==='NotAllowedError';this.musicStatus=this.musicPlaybackBlocked?'blocked':'unavailable';if(this.musicStatus==='unavailable'){this.musicFailures++;this.musicRetryAt=Date.now()+Math.min(15000,2000*2**(this.musicFailures-1));}this.musicSource=null;}}).finally(()=>{if(token===this.musicPlayToken){this.musicPlayPending=null;this.musicPriming=false;}});
  }
  updateMusic(active){
    this.musicActive=active;
    if(!this.musicElement)return;
    if(!active){if(!this.musicPriming)this.pauseMusic();return;}
    if(this.musicElement.paused&&!this.musicPlayPending&&this.musicStatus!=='blocked'&&this.musicStatus!=='unavailable')this.requestMusicPlayback();
  }
  // Also called by explicit pause/visibility handlers before the next animation frame.
  pauseMusic(){
    this.musicActive=false;this.musicPlayToken++;this.musicPlayPending=null;this.musicPriming=false;
    if(this.musicElement){this.musicElement.pause();this.musicOffset=this.musicElement.currentTime||0;}
    this.musicSource=null;if(this.ready)this.musicBus.gain.setTargetAtTime(0,this.ctx.currentTime,.03);
  }
  resetMusic(){
    // startRace initializes at the beginning of its gesture, then resets race state.
    // Do not abort that very first pending media unlock before data has arrived.
    if(!this.musicPriming)this.pauseMusic();this.musicOffset=0;
    if(this.musicElement){try{this.musicElement.currentTime=0;}catch{this.musicElement.onloadedmetadata=()=>{if(this.musicElement)this.musicElement.currentTime=0;};}}
  }
  async dispose(){
    if(!this.ready)return;
    this.pauseMusic();this.stopStart();this.startBuffer=null;this.startPromise=null;
    if(this.musicElement){this.musicElement.oncanplay=null;this.musicElement.onerror=null;this.musicElement.onloadedmetadata=null;this.musicElement.removeAttribute('src');this.musicElement.load();}
    this.musicMediaNode?.disconnect();this.musicGain?.disconnect();this.musicElement=null;this.musicMediaNode=null;this.musicGain=null;
    this.ready=false;this.enabled=false;this.musicBuffer=null;this.musicPromise=null;this.musicOffset=0;
    await this.ctx.close();
  }
  setEnabled(value){this.enabled=value;if(!value){this.stopStart();if(this.ready)this.pauseMusic();}if(this.ready){this.master.gain.setTargetAtTime(value?.4:0,this.ctx.currentTime,.06);if(value){void this.resumeFromGesture();void this.loadMusic();}}}
  tone(freq,duration=.15,volume=.12,type='sine',destination=null,when=null){if(!this.ready)return;const a=this.ctx,t=when??a.currentTime,o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(destination||this.compressor);o.start(t);o.stop(t+duration+.03);}
  noiseHit(duration=.13,volume=.15,frequency=2500,destination=null,when=null){if(!this.ready)return;const a=this.ctx,t=when??a.currentTime,n=a.createBufferSource(),f=a.createBiquadFilter(),g=a.createGain();n.buffer=this.noise;f.type='highpass';f.frequency.value=frequency;g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);n.connect(f);f.connect(g);g.connect(destination||this.compressor);n.start(t);n.stop(t+duration+.02);}
  count(last=false){this.tone(last?880:440,last?.45:.13,.16);}
  collision(strength){this.noiseHit(.14,(.12+strength*.15)*this.volume,500);}
  reward(){this.tone(740,.14,.08);this.tone(1108,.22,.05,'sine',null,this.ready?this.ctx.currentTime+.09:0);}
  update(player,track,rivals,active,progress){
    if(!this.ready)return;const t=this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.enabled?.4:0,t,.1);
    this.musicBus.gain.setTargetAtTime(active&&this.enabled?Math.max(0,Math.min(1,this.musicVolume))*.75:0,t,.16);
    this.updateMusic(active&&this.enabled);
    if(active&&this.enabled&&this.musicStatus==='unavailable'&&this.musicFailures<3&&Date.now()>=this.musicRetryAt)void this.loadMusic();
  }
}
