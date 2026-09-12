import {clamp} from './physics.js';
const smooth=v=>{const t=clamp(v,0,1);return t*t*(3-2*t);};
/** Digital keys turn the steering rack; road position and preview never affect controls. */
export class DrivingInput{
 constructor(){this.reset();}
 reset(){this.steer=0;this.countersteering=false;this.lastDirection=0;this.neutralTime=Infinity;this.reversalTime=0;}
 sample(input,speed,dt,config,vehicle){
  const target=clamp(input.steer||0,-1,1),velocity=Math.abs(speed);
  this.reversalTime=Math.max(0,this.reversalTime-dt);
  // The physics rack already smooths centring; a second release filter prolongs the turn.
  if(target===0){this.steer=0;this.countersteering=false;this.neutralTime+=dt;return {...input,steer:0};}
  const rememberedReverse=target*this.lastDirection<0&&this.neutralTime<.6;
  if(rememberedReverse)this.reversalTime=.65;
  this.lastDirection=Math.sign(target);this.neutralTime=0;
  this.countersteering=target!==0 && (rememberedReverse || target*this.steer<0 || (this.countersteering && Math.abs(target-this.steer)>.001));
  const rate=this.countersteering?16:8/(1+velocity/160);
  this.steer+=clamp(target-this.steer,-rate*dt,rate*dt);
  const shaped=this.steer*(.85+.15*Math.abs(this.steer));
  const available=config.steer/(1+velocity/32);
  // Match tyre capacity, including steady-state understeer, without a speed switch.
  const mu=vehicle?.grip||config.grip;
  const recovery=input.handbrake||this.reversalTime>0;
  const accel=clamp(mu*9.81*(recovery?1.08:.78),4,recovery?12:8.5);
  const a=config.wheelbase*.49,b=config.wheelbase*.51;
  const understeer=Math.max(0,config.mass/config.wheelbase*(b/75000-a/78000));
  const corner=Math.atan(config.wheelbase*accel/(velocity*velocity+1))+understeer*accel;
  let limit=1+(Math.min(1,corner/available)-1)*smooth((velocity-5)/10);
  // A sliding car needs enough opposite lock; this only widens the player's requested range.
  if(target*this.steer>0 && target*(vehicle?.r||0)<0){
   const slip=Math.abs(Math.atan2(vehicle?.v||0,Math.max(4,velocity)));
   limit=Math.min(1,limit+slip/available);
  }
  return {...input,steer:shaped*(input.handbrake?Math.min(1,limit*1.7):limit)};
 }
}


