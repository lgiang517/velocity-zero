/** Local licensed music with short event cues; no continuous synthesized drones. */
export class DriveAudio {
  constructor(){this.ready=false;this.enabled=false;this.volume=.65;this.musicVolume=.35;this.lastGear=0;this.musicStatus='idle';this.musicBuffer=null;this.musicSource=null;this.musicActive=false;}
  async init(){
    if(this.ready){await this.ctx.resume();return;}
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    this.ctx=new AC();const a=this.ctx;
    this.master=a.createGain();this.master.gain.value=.4;this.master.connect(a.destination);
    this.compressor=a.createDynamicsCompressor();this.compressor.threshold.value=-15;this.compressor.ratio.value=7;this.compressor.connect(this.master);
    // Noise exists only as a reusable buffer for short collision and shift cues.
    const noise=a.createBuffer(1,a.sampleRate*.5,a.sampleRate),data=noise.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    this.noise=noise;
    // Keep music out of the effects compressor to prevent collision-driven pumping.
    this.musicBus=a.createGain();this.musicBus.gain.value=0;this.musicBus.connect(this.master);
    this.ready=true;this.enabled=true;await a.resume();void this.loadMusic();
  }
  async loadMusic(){
    this.musicStatus='loading';
    try{
      const response=await fetch(import.meta.env.BASE_URL+'audio/exhilarate-kevin-macleod.mp3',{signal:AbortSignal.timeout(20000)});
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
      gain.gain.cancelScheduledValues(t);gain.gain.setTargetAtTime(0,t,.045);
      source.stop(t+.22);this.musicSource=null;
    }
    if(active&&this.musicBuffer&&!this.musicSource){
      const source=a.createBufferSource(),gain=a.createGain();
      source.buffer=this.musicBuffer;source.loop=true;gain.gain.setValueAtTime(0,t);gain.gain.setTargetAtTime(.72,t,.18);
      source.connect(gain);gain.connect(this.musicBus);
      source.onended=()=>{source.disconnect();gain.disconnect();};
      source.start();this.musicSource={source,gain};
    }
    this.musicActive=active;
  }
  setEnabled(value){this.enabled=value;if(this.ready){this.master.gain.setTargetAtTime(value?.4:0,this.ctx.currentTime,.06);if(value)this.ctx.resume();}}
  tone(freq,duration=.15,volume=.12,type='sine',destination=null,when=null){if(!this.ready)return;const a=this.ctx,t=when??a.currentTime,o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(destination||this.compressor);o.start(t);o.stop(t+duration+.03);}
  noiseHit(duration=.13,volume=.15,frequency=2500,destination=null,when=null){if(!this.ready)return;const a=this.ctx,t=when??a.currentTime,n=a.createBufferSource(),f=a.createBiquadFilter(),g=a.createGain();n.buffer=this.noise;f.type='highpass';f.frequency.value=frequency;g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);n.connect(f);f.connect(g);g.connect(destination||this.compressor);n.start(t);n.stop(t+duration+.02);}
  count(last=false){this.tone(last?880:440,last?.45:.13,.16);}
  collision(strength){this.noiseHit(.14,(.12+strength*.15)*this.volume,500);}
  reward(){this.tone(740,.14,.08);this.tone(1108,.22,.05,'sine',null,this.ready?this.ctx.currentTime+.09:0);}
  update(player,track,rivals,active,progress){
    if(!this.ready)return;const t=this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.enabled?.4:0,t,.1);
    this.musicBus.gain.setTargetAtTime(active?this.musicVolume*.4:0,t,.16);
    if(player.gear!==this.lastGear){
      if(active&&player.gear>1)this.noiseHit(.06,.025*this.volume,2400);
      this.lastGear=player.gear;
    }
    this.updateMusic(active);
  }
}
