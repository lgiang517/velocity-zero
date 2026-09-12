/** Licensed music, one-shot ignition and short event cues. No continuous engine audio. */
export class DriveAudio {
  constructor(){this.ready=false;this.enabled=false;this.volume=.65;this.musicVolume=.35;this.musicStatus='idle';this.musicBuffer=null;this.musicSource=null;this.musicActive=false;this.musicOffset=0;this.musicStartedAt=0;this.startToken=0;this.startSource=null;this.startBuffer=null;this.startPromise=null;}
  async init(){
    if(this.ready){await this.ctx.resume();return;}
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
    this.ready=true;this.enabled=true;await a.resume();void this.loadMusic();void this.loadStart();
  }
  loadStart(){
    if(this.startPromise)return this.startPromise;
    const context=this.ctx;
    this.startPromise=(async()=>{
      try{
        const response=await fetch(import.meta.env.BASE_URL+'audio/engine/ferrari-start-5s.wav',{signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw new Error(`Ignition HTTP ${response.status}`);
        const buffer=await context.decodeAudioData(await response.arrayBuffer());
        if(this.ctx===context&&this.ready)this.startBuffer=buffer;
        return buffer;
      }catch(error){console.warn('Ignition cue unavailable; continuing silently.',error);return null;}
    })();
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
  async loadMusic(){
    this.musicStatus='loading';
    try{
      const response=await fetch(import.meta.env.BASE_URL+'audio/edm-detection-mode-kevin-macleod.mp3',{signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error(`Music HTTP ${response.status}`);
      this.musicBuffer=await this.ctx.decodeAudioData(await response.arrayBuffer());
      this.musicStatus='ready';
    }catch(error){this.musicStatus='unavailable';console.warn('Racing track unavailable; music stays silent.',error);}
  }
  // Audio nodes are allocated only on playback transitions, never every frame.
  updateMusic(active){
    const a=this.ctx,t=a.currentTime;
    if(!active&&this.musicSource){
      const {source,gain}=this.musicSource;
      this.musicOffset=(this.musicOffset+t-this.musicStartedAt)%this.musicBuffer.duration;
      gain.gain.cancelScheduledValues(t);gain.gain.setTargetAtTime(0,t,.045);
      source.stop(t+.22);this.musicSource=null;
    }
    if(active&&this.musicBuffer&&!this.musicSource){
      const source=a.createBufferSource(),gain=a.createGain();
      source.buffer=this.musicBuffer;source.loop=true;gain.gain.setValueAtTime(0,t);gain.gain.setTargetAtTime(.72,t,.18);
      source.connect(gain);gain.connect(this.musicBus);
      source.onended=()=>{source.disconnect();gain.disconnect();};
      source.start(0,this.musicOffset);this.musicStartedAt=t;this.musicSource={source,gain};
    }
    this.musicActive=active;
  }
  resetMusic(){
    if(this.ready)this.updateMusic(false);
    this.musicOffset=0;
  }
  async dispose(){
    if(!this.ready)return;
    this.updateMusic(false);this.stopStart();this.startBuffer=null;this.startPromise=null;
    this.ready=false;this.enabled=false;this.musicBuffer=null;this.musicOffset=0;
    await this.ctx.close();
  }
  setEnabled(value){this.enabled=value;if(!value)this.stopStart();if(this.ready){this.master.gain.setTargetAtTime(value?.4:0,this.ctx.currentTime,.06);if(value)this.ctx.resume();}}
  tone(freq,duration=.15,volume=.12,type='sine',destination=null,when=null){if(!this.ready)return;const a=this.ctx,t=when??a.currentTime,o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(destination||this.compressor);o.start(t);o.stop(t+duration+.03);}
  noiseHit(duration=.13,volume=.15,frequency=2500,destination=null,when=null){if(!this.ready)return;const a=this.ctx,t=when??a.currentTime,n=a.createBufferSource(),f=a.createBiquadFilter(),g=a.createGain();n.buffer=this.noise;f.type='highpass';f.frequency.value=frequency;g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);n.connect(f);f.connect(g);g.connect(destination||this.compressor);n.start(t);n.stop(t+duration+.02);}
  count(last=false){this.tone(last?880:440,last?.45:.13,.16);}
  collision(strength){this.noiseHit(.14,(.12+strength*.15)*this.volume,500);}
  reward(){this.tone(740,.14,.08);this.tone(1108,.22,.05,'sine',null,this.ready?this.ctx.currentTime+.09:0);}
  update(player,track,rivals,active,progress){
    if(!this.ready)return;const t=this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.enabled?.4:0,t,.1);
    this.musicBus.gain.setTargetAtTime(active?this.musicVolume*.4:0,t,.16);
    this.updateMusic(active);
  }
}
