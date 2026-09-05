import {clamp} from './physics.js';
/** Local CC BY 4.0 racing score, with synthesized engine, surfaces and fallback beat. */
export class DriveAudio {
  constructor(){this.ready=false;this.enabled=false;this.volume=.65;this.musicVolume=.35;this.nextBeat=0;this.beat=0;this.lastGear=0;this.musicStatus='idle';this.musicBuffer=null;this.musicSource=null;this.musicActive=false;}
  async init(){
    if(this.ready){await this.ctx.resume();return;}
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    this.ctx=new AC();const a=this.ctx;
    this.master=a.createGain();this.master.gain.value=.4;this.master.connect(a.destination);
    this.compressor=a.createDynamicsCompressor();this.compressor.threshold.value=-15;this.compressor.ratio.value=7;this.compressor.connect(this.master);
    this.engineBus=a.createGain();this.engineBus.gain.value=.1;this.engineBus.connect(this.compressor);
    this.engineFilter=a.createBiquadFilter();this.engineFilter.type='lowpass';this.engineFilter.frequency.value=1000;this.engineFilter.Q.value=.7;this.engineFilter.connect(this.engineBus);
    this.osc=[];for(let i=0;i<4;i++){const o=a.createOscillator(),g=a.createGain();o.type=i===0?'sawtooth':'triangle';g.gain.value=[.25,.18,.07,.045][i];o.frequency.value=30*(i+1);o.connect(g);g.connect(this.engineFilter);o.start();this.osc.push(o);}
    const noise=a.createBuffer(1,a.sampleRate*2,a.sampleRate),data=noise.getChannelData(0);let brown=0;for(let i=0;i<data.length;i++){brown=(brown+(Math.random()*2-1)*.06)/1.03;data[i]=brown*3;}
    this.noise=noise;this.road=a.createBufferSource();this.road.buffer=noise;this.road.loop=true;
    this.windFilter=a.createBiquadFilter();this.windFilter.type='lowpass';this.windFilter.frequency.value=600;
    this.windGain=a.createGain();this.windGain.gain.value=0;this.road.connect(this.windFilter);this.windFilter.connect(this.windGain);this.windGain.connect(this.compressor);this.road.start();
    this.squeal=a.createOscillator();this.squeal.type='sawtooth';this.squeal.frequency.value=530;const sf=a.createBiquadFilter();sf.type='bandpass';sf.frequency.value=1300;sf.Q.value=.8;this.squealGain=a.createGain();this.squealGain.gain.value=0;this.squeal.connect(sf);sf.connect(this.squealGain);this.squealGain.connect(this.compressor);this.squeal.start();
    // Short feedback delay gives enclosed roads a materially different engine sound.
    this.delay=a.createDelay(.5);this.delay.delayTime.value=.12;this.echo=a.createGain();this.echo.gain.value=0;this.feedback=a.createGain();this.feedback.gain.value=.27;this.engineBus.connect(this.delay);this.delay.connect(this.echo);this.echo.connect(this.compressor);this.delay.connect(this.feedback);this.feedback.connect(this.delay);
    this.musicBus=a.createGain();this.musicBus.gain.value=.14;this.musicFilter=a.createBiquadFilter();this.musicFilter.frequency.value=10000;this.musicBus.connect(this.musicFilter);this.musicFilter.connect(this.compressor);
    this.rivalOsc=a.createOscillator();this.rivalOsc.type='triangle';this.rivalGain=a.createGain();this.rivalGain.gain.value=0;this.pan=a.createStereoPanner();this.rivalOsc.connect(this.rivalGain);this.rivalGain.connect(this.pan);this.pan.connect(this.compressor);this.rivalOsc.start();
    this.ready=true;this.enabled=true;await a.resume();this.nextBeat=a.currentTime;void this.loadMusic();
  }
  async loadMusic(){
    this.musicStatus='loading';
    try{
      const response=await fetch(import.meta.env.BASE_URL+'audio/exhilarate-kevin-macleod.mp3',{signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error(`Music HTTP ${response.status}`);
      this.musicBuffer=await this.ctx.decodeAudioData(await response.arrayBuffer());
      this.musicStatus='ready';
    }catch(error){this.musicStatus='fallback';console.warn('Racing track unavailable; using original synthesized score.',error);}
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
  collision(strength){this.noiseHit(.22,.25+strength*.3,150);this.tone(48,.2,.25,'triangle');}
  reward(){this.tone(740,.14,.08);this.tone(1108,.22,.05,'sine',null,this.ready?this.ctx.currentTime+.09:0);}
  update(player,track,rivals,active,progress){
    if(!this.ready)return;const a=this.ctx,t=a.currentTime;
    const tunnel=track.inTunnel(player.s);const volume=this.volume;
    this.master.gain.setTargetAtTime(this.enabled?.4:0,t,.1);
    const cylinders=player.config.id==='muscle'?4:player.config.id==='light'?2:3;
    const base=player.rpm/60*cylinders;
    for(let i=0;i<this.osc.length;i++)this.osc[i].frequency.setTargetAtTime(base*(i===0?.5:i)+Math.sin(t*11)*.5,t,.035);
    this.engineFilter.frequency.setTargetAtTime(350+player.throttle*1300+player.rpm*.16,t,.06);
    this.engineBus.gain.setTargetAtTime((active?.20+player.throttle*.12:.085)*volume*(player.shifting>0?.5:1),t,.045);
    this.windGain.gain.setTargetAtTime(active?clamp(Math.abs(player.u)/90,0,1)*.22*volume:0,t,.15);
    this.windFilter.frequency.setTargetAtTime(350+Math.abs(player.u)*18,t,.2);
    this.squealGain.gain.setTargetAtTime(active?clamp((player.slip-.04)*.6,0,.13)*volume:0,t,.035);
    this.squeal.frequency.setTargetAtTime(480+player.u*4+Math.sin(t*25)*30,t,.02);
    this.echo.gain.setTargetAtTime(tunnel?.48:0,t,.2);
    const duck=player.impact>.3?.25:player.boost?.66:1;
    this.musicBus.gain.setTargetAtTime(active?this.musicVolume*.4*duck:0,t,.16);
    this.musicFilter.frequency.setTargetAtTime(tunnel?2800:11000,t,.3);
    if(player.gear!==this.lastGear&&active){if(player.gear>1)this.noiseHit(.11,.06*volume,2400);this.lastGear=player.gear;}
    if(rivals.length){const near=rivals.reduce((a,b)=>Math.abs(a.s-player.s)<Math.abs(b.s-player.s)?a:b);const gap=Math.abs(near.s-player.s);this.rivalGain.gain.setTargetAtTime(active?Math.max(0,1-gap/65)*.075*volume:0,t,.1);this.rivalOsc.frequency.setTargetAtTime(near.rpm/60*2,t,.1);this.pan.pan.setTargetAtTime(clamp((near.d-player.d)/7,-1,1),t,.1);}
    else this.rivalGain.gain.setTargetAtTime(0,t,.1);
    this.updateMusic(active);
    if(!active||this.musicBuffer){this.nextBeat=t;return;}
    if(this.nextBeat<t-.5)this.nextBeat=t;
    while(this.nextBeat<t+.1){this.scheduleBeat(this.nextBeat,this.beat++,player,progress);this.nextBeat+=60/160/2;}
  }
  scheduleBeat(t,beat,p,progress){
    const bus=this.musicBus,step=beat%16;
    // Half-time pulse opens into breakbeat drums as road speed climbs.
    if(step%4===0||(p.u>35&&[7,10].includes(step))){const a=this.ctx,o=a.createOscillator(),g=a.createGain();o.frequency.setValueAtTime(135,t);o.frequency.exponentialRampToValueAtTime(42,t+.12);g.gain.setValueAtTime(.75,t);g.gain.exponentialRampToValueAtTime(.001,t+.25);o.connect(g);g.connect(bus);o.start(t);o.stop(t+.28);}
    if(p.u>22&&step%8===4)this.noiseHit(.14,.9,900,bus,t);
    if(p.u>34)this.noiseHit(.035,step%2?.22:.35,4500,bus,t);
    const notes=[55,55,65.406,49],root=notes[Math.floor(beat/16)%4];
    if(step%2===0)this.tone(root, .25, p.u>25?.29:.15,'sawtooth',bus,t);
    if(p.u>46||progress>.75){const intervals=[2,3,4,6,4,3,2,1.5];this.tone(root*intervals[Math.floor(step/2)%8]*2,.3,.11,'triangle',bus,t);}
    if(progress>.8&&step%4===0)this.tone(root*8,.6,.05,'sine',bus,t);
  }
}

