import {clamp} from './physics.js';
const smooth=v=>{const t=clamp(v,0,1);return t*t*(3-2*t);};
/** Keys turn the steering rack. They never command lateral movement or follow the road. */
export class DrivingInput{
 constructor(){this.reset();}
 reset(){this.steer=0;}
 sample(input,speed,dt,config,vehicle){
  const target=clamp(input.steer||0,-1,1),velocity=Math.abs(speed);
  const reversing=target*this.steer<0;
  const rate=target===0?4.5:reversing?5:2.6/(1+velocity/65);
  this.steer+=clamp(target-this.steer,-rate*dt,rate*dt);
  const shaped=this.steer*(.38+.62*Math.abs(this.steer));
  const available=config.steer/(1+velocity/32);
  // Match tyre capacity, including steady-state understeer, without a speed switch.
  const mu=vehicle?.grip||config.grip;
  const accel=clamp(mu*9.81*.88,4,9.8);
  const a=config.wheelbase*.49,b=config.wheelbase*.51;
  const understeer=Math.max(0,config.mass/config.wheelbase*(b/75000-a/78000));
  const corner=Math.atan(config.wheelbase*accel/(velocity*velocity+1))+understeer*accel;
  const limit=1+(Math.min(1,corner/available)-1)*smooth((velocity-5)/10);
  return {...input,steer:shaped*(input.handbrake?Math.min(1,limit*1.7):limit)};
 }
}


