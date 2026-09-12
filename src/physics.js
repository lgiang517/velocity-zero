import {barrierLimit} from './road-boundaries.js';
const GEAR_RATIOS=[3.3,2.35,1.72,1.31,1.06,.87];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
export const CARS = [
  { id: 'gt', name: 'SOLSTICE GT', type: 'GT / ALL-WHEEL DRIVE', description: 'Planted through the corner. Relentless on the straight.', mass: 1540, hp: 560, power: 350000, drive: 'AWD', grip: 1.2, response: 18, steer: .48, wheelbase: 2.72, drag: .42, maxSpeed: 88, brake: 8, rearGrip: 1.06 },
  { id: 'light', name: 'KAZE R', type: 'LIGHTWEIGHT / REAR-WHEEL DRIVE', description: 'A lighter touch. A livelier rear. Made for the mountain.', mass: 1080, hp: 320, power: 225000, drive: 'RWD', grip: 1.09, response: 20, steer: .56, wheelbase: 2.43, drag: .38, maxSpeed: 78, brake: 7.7, rearGrip: 1.01 },
  { id: 'muscle', name: 'IRONWOOD V8', type: 'MUSCLE / REAR-WHEEL DRIVE', description: 'Big displacement. Heavy hands. Unmistakable character.', mass: 1840, hp: 720, power: 480000, drive: 'RWD', grip: 1.02, response: 16, steer: .43, wheelbase: 2.95, drag: .53, maxSpeed: 94, brake: 7.2, rearGrip: 1.04 },
];
export const MODES = [
  {id:'sprint',name:'SPRINT',desc:'One coast. One rival. First to the finish.',rivals:1,laps:1,traffic:0},
  {id:'circuit',name:'CIRCUIT',desc:'Two laps around the island. Three rivals.',rivals:3,laps:2,traffic:0},
  {id:'touge',name:'TOUGE',desc:'A technical mountain duel. Every apex counts.',rivals:1,laps:1,traffic:0,start:.25,length:.33},
  {id:'midnight',name:'MIDNIGHT RUN',desc:'After dark. Thread your way through traffic.',rivals:2,laps:1,traffic:12},
  {id:'time',name:'TIME ATTACK',desc:'A clean road. Just you and the clock.',rivals:0,laps:1,traffic:0},
  {id:'drift',name:'DRIFT',desc:'Ninety seconds to make the mountain yours.',rivals:0,laps:1,traffic:0,start:.25,timer:90},
  {id:'pursuit',name:'PURSUIT',desc:'Keep moving. Outrun the patrol to the coast.',rivals:2,laps:1,traffic:14},
];

/** Dynamic single-track model in road coordinates. SI units; positive steering follows the positive road lateral axis. */
export class VehiclePhysics {
  constructor(config=CARS[0]) { this.config=config; this.reset(); }
  reset(s=0,d=0) { Object.assign(this,{s,d,u:0,v:0,yaw:0,r:0,steer:0,throttle:0,brake:0,roll:0,pitch:0,nitro:100,boost:false,rpm:900,gear:0,temperature:55,brakeHeat:0,slip:0,grip:1,impact:0,score:0,combo:1,driftTime:0,distance:0,topSpeed:0,collisions:0,lastAccel:0,reverseHold:0,shifting:0,shiftEvent:false}); }
  step(dt, input, road={curvature:0,slope:0,wet:0}, assists=true) {
    const c=this.config, oldU=this.u;
    // The driver brake pedal overrides engine torque even when W is still held.
    const driveThrottle=(input.brake||0)>0?0:(input.throttle||0);
    this.impact=Math.max(0,this.impact-dt*2.7);
    const steerTarget=clamp(input.steer||0,-1,1)*c.steer/(1+Math.abs(this.u)/32);
    const rackRate=steerTarget*this.steer<0?c.response*1.8:c.response;
    this.steer=damp(this.steer,steerTarget,rackRate,dt);
    this.throttle=damp(this.throttle,driveThrottle,driveThrottle>0?7:24,dt);
    this.brake=damp(this.brake,input.brake||0,28,dt);
    this.boost=!!input.nitro && driveThrottle>0 && this.nitro>1 && this.u>8 && this.throttle>.4;
    this.nitro=clamp(this.nitro+(this.boost?-25:Math.abs(this.u)>40?1.6:.18)*dt,0,100);
    this.temperature=clamp(this.temperature+(this.slip*17+this.brake*Math.abs(this.u)*.11-(this.temperature-60)*.025)*dt,20,125);
    this.brakeHeat=clamp(this.brakeHeat+(this.brake*Math.abs(this.u)*.018-this.brakeHeat*.2)*dt,0,1);
    const tireTemp=1-Math.abs(this.temperature-78)*.0016;
    const shoulderT=clamp((Math.abs(this.d)-8.1)/1.1,0,1);
    const shoulder=1-.18*shoulderT*shoulderT*(3-2*shoulderT);
    const aquaplane=road.wet>.7 && Math.sin(this.s*.078)> .84 && this.u>48 ? .7:1;
    const mu=c.grip*(1-road.wet*.31)*tireTemp*shoulder*aquaplane;
    this.grip=mu;
    const brakeLock=!assists && this.brake>.85 && Math.abs(this.u)>18 ? .59:1;
    const mass=c.mass, g=9.81;
    const speed=Math.max(4,Math.abs(this.u));
    const transfer=clamp(-this.lastAccel*.018,-.14,.16);
    const frontLoad=mass*g*(.5+transfer)+this.u*this.u*.65;
    const rearLoad=mass*g*(.5-transfer)+this.u*this.u*.65;
    const a=c.wheelbase*.49,b=c.wheelbase*.51;
    const frontSlip=this.steer-Math.atan2(this.v+a*this.r,speed);
    const rearSlip=-Math.atan2(this.v-b*this.r,speed);
    const handbrake=input.handbrake? .32:1;
    const powerSlip=c.drive==='RWD' ? 1-this.throttle*clamp(Math.abs(this.steer)*(assists?.45:2),0,assists?.04:.18):1;
    const frontLimit=frontLoad*mu*brakeLock*(1-this.brake*.16);
    const rearLimit=rearLoad*mu*c.rearGrip*handbrake*powerSlip*brakeLock;
    const frontForce=frontLimit*Math.tanh(frontSlip*75000/frontLimit);
    const rearForce=rearLimit*Math.tanh(rearSlip*78000/rearLimit);
    // Blend parking kinematics into tyre dynamics instead of switching at 3 m/s.
    const blend=clamp((Math.abs(this.u)-2)/8,0,1);
    const dynamicWeight=blend*blend*(3-2*blend);
    const kinematicR=this.u*Math.tan(this.steer)/c.wheelbase;
    const kinematicV=b*kinematicR;
    const dynamicV=this.v+((frontForce+rearForce)/mass-this.u*this.r)*dt;
    const dynamicR=this.r+(a*frontForce-b*rearForce)/(mass*c.wheelbase*c.wheelbase*.24)*dt;
    this.v=damp(this.v,kinematicV,12,dt)*(1-dynamicWeight)+dynamicV*dynamicWeight;
    this.r=damp(this.r,kinematicR,12,dt)*(1-dynamicWeight)+dynamicR*dynamicWeight;
    // ESC uses the actual front wheels and local tyre state, never road heading or a target lane.
    if(assists&&!input.handbrake){
      const maxYaw=mu*g/Math.max(4,Math.abs(this.u));
      const understeer=Math.max(0,mass/c.wheelbase*(b/75000-a/78000));
      const requestedYaw=clamp(this.u*Math.tan(this.steer)/(c.wheelbase+understeer*this.u*this.u),-maxYaw,maxYaw);
      // Remove extra rear rotation; do not manufacture yaw before the tyres respond.
      if(Math.abs(this.r)>Math.abs(requestedYaw)||this.r*requestedYaw<0){
        this.r=damp(this.r,requestedYaw,10,dt);
      }
      // The rear axle should follow the front without accumulating an unrecoverable side slide.
      const slipEnvelope=Math.max(.25,Math.abs(this.u)*.04);
      const balancedV=clamp(b*this.r-mass*a/c.wheelbase*this.u*this.u*this.r/78000,-slipEnvelope,slipEnvelope);
      const slipError=this.v-balancedV;
      const stability=clamp((Math.abs(slipError)-Math.max(.4,Math.abs(this.u)*.025))/Math.max(1,Math.abs(this.u)*.05),0,1);
      this.v=damp(this.v,balancedV,7*stability*dynamicWeight,dt);
    }
    let engine=Math.min(c.power/Math.max(14,Math.abs(this.u))/mass, c.drive==='AWD'?9.8:10.6)*(driveThrottle>0?this.throttle:0);
    if(this.u>c.maxSpeed)engine*=clamp(1-(this.u-c.maxSpeed)/6,0,1);
    this.shifting=Math.max(0,this.shifting-dt);
    if(this.shifting>0)engine*=.4;
    const direction=this.u>=0?1:-1;
    // Sport-gear overrun: compression drag starts at lift-off, then builds as the throttle closes.
    // Resistance depends only on local speed and throttle; slope still acts independently.
    const engineBraking=(driveThrottle>0?0:1-.15*this.throttle)*(1.5+Math.abs(this.u)*.044)*clamp(Math.abs(this.u)/2,0,1);
    const drag=(.19+c.drag*this.u*this.u/mass+engineBraking)*direction;
    let braking=this.brake*Math.min(c.brake*(1-road.wet*.25),mu*g*(assists?1:brakeLock));
    if(input.handbrake)braking+=3.3;
    const driveDirection=Math.abs(this.u)>.15?Math.sign(this.u):1;
    let acc=engine+(this.boost?6.3:0)-drag-braking*driveDirection-road.slope*g;
    if(this.u<.3 && this.throttle<.05 && this.brake>.7){this.reverseHold+=dt;if(this.reverseHold>.65)acc=-3.6-drag;}else this.reverseHold=0;
    this.u+=acc*dt;
    if(oldU>=0&&this.u<0&&this.reverseHold<.65)this.u=0;
    this.u=clamp(this.u,-9,c.maxSpeed+18);
    if(Math.abs(this.u)<.18&&this.throttle<.02&&this.brake<.1)this.u=0;
    this.lastAccel=damp(this.lastAccel,(this.u-oldU)/dt,8,dt);
    const along=this.u*Math.cos(this.yaw)-this.v*Math.sin(this.yaw);
    const lateral=this.u*Math.sin(this.yaw)+this.v*Math.cos(this.yaw);
    const advance=along/Math.max(.65,1-road.curvature*this.d)*dt;
    this.s+=advance;this.distance+=Math.max(0,advance);
    this.d+=lateral*dt;
    this.yaw+=this.r*dt-road.curvature*advance;
    this.yaw=Math.atan2(Math.sin(this.yaw),Math.cos(this.yaw));
    this.slip=Math.abs(Math.atan2(this.v,Math.max(3,Math.abs(this.u))));
    this.roll=damp(this.roll,clamp(-((frontForce+rearForce)/mass*dynamicWeight+this.u*this.r*(1-dynamicWeight))*.010,-.09,.09),8,dt);
    this.pitch=damp(this.pitch,clamp(this.lastAccel*.004,-.045,.035),5,dt);
    this.resolveBarrier(road.curvature,dt);
    this.topSpeed=Math.max(this.topSpeed,this.u*3.6);
    const shaftRpm=Math.abs(this.u)/(.375*2*Math.PI)*60*3.75;
    let gear=this.u<-.5?-1:this.u<1?0:clamp(this.gear,1,6);
    if(gear>0){
      if(this.gear<=0){
        while(gear<6&&shaftRpm*GEAR_RATIOS[gear-1]>7000)gear++;
      }else if(this.shifting===0){
        if(gear<6&&shaftRpm*GEAR_RATIOS[gear-1]>7000)gear++;
        else if(gear>1&&shaftRpm*GEAR_RATIOS[gear-1]<2800)gear--;
      }
    }
    this.shiftEvent=gear>this.gear&&this.gear>0;
    if(gear!==this.gear&&this.gear>0&&gear>0)this.shifting=.13;
    this.gear=gear;
    const clutchRpm=900+this.throttle*1500;
    const wheelRpm=gear===0?0:shaftRpm*GEAR_RATIOS[Math.max(0,gear-1)];
    this.rpm=damp(this.rpm,clamp(Math.max(clutchRpm,wheelRpm),900,8000),12,dt);
    if(this.slip>.09&&this.u>12){this.driftTime+=dt;this.score+=this.slip*this.u*dt*10*this.combo;this.combo=Math.min(5,1+Math.floor(this.driftTime/2));this.nitro=clamp(this.nitro+dt*4.5,0,100);}else{this.driftTime=Math.max(0,this.driftTime-dt*2);if(this.driftTime===0)this.combo=1;}
  }
  resolveBarrier(curvature=0,dt=1/120){
    const limit=barrierLimit(this.config,this.yaw,curvature);
    if(Math.abs(this.d)<=limit)return false;
    const side=Math.sign(this.d),cos=Math.cos(this.yaw),sin=Math.sin(this.yaw);
    let along=this.u*cos-this.v*sin;
    const outward=side*(this.u*sin+this.v*cos);
    if(outward>.6){this.collide(Math.min(1,outward/16));along*=1-Math.min(.35,outward*.012);}
    // Resolve the normal velocity in road space, including the heading contribution.
    // Simply reversing body-space v lets a yawed car drive straight through the rail.
    // A rear corner may still touch while the driver is already steering away.
    // Preserve inward velocity and yaw; only stop motion pushing farther into the rail.
    const lateral=side*(outward>0?-outward*.025:outward);
    const roadRate=curvature*along;
    if(outward>0 && side*this.yaw>0)this.yaw=damp(this.yaw,0,9,dt);
    if(side*(this.r-roadRate)>0)this.r=roadRate;
    this.u=along*Math.cos(this.yaw)+lateral*Math.sin(this.yaw);
    this.v=-along*Math.sin(this.yaw)+lateral*Math.cos(this.yaw);
    this.d=side*Math.min(limit,barrierLimit(this.config,this.yaw,curvature));
    return true;
  }
  collide(strength=.4){if(this.impact<.1){this.collisions++;this.impact=clamp(.15+strength,0,1);this.u*=1-clamp(strength*.4,.04,.45);this.combo=1;this.score=Math.max(0,this.score-80);}}
}

export class DriverAI {
  constructor(car, personality='precision',seed=1){this.car=car;this.personality=personality;this.seed=seed;this.lane=(seed%2? -1:1)*2.8;this.error=0;}
  controls(track,player,others,time){
    const p=this.car;const look=clamp(p.u*1.05+12,16,90);
    let curvature=0;
    for(let i=0;i<5;i++){const k=track.sample(p.s+look*i*.55).curvature;if(Math.abs(k)>Math.abs(curvature))curvature=k;}
    const aggressive=this.personality==='risk'||this.personality==='aggressor';
    let targetSpeed=Math.min(p.config.maxSpeed*.84,Math.sqrt(8.2/Math.max(.0014,Math.abs(curvature))));
    if(aggressive)targetSpeed*=1.065;
    if(this.personality==='drifter')targetSpeed*=.96;
    let targetLane=this.lane;
    const gap=player.s-p.s;
    if(gap>0&&gap<38)targetLane=player.d+(player.d>0?-3.6:3.6);
    if(this.personality==='aggressor'&&gap<0&&gap>-28)targetLane=clamp(player.d,-4,4);
    for(const other of others){if(other===p)continue;const distance=other.s-p.s;if(distance>0&&distance<28&&Math.abs(other.d-targetLane)<2.2){targetLane=other.d>0?-3.7:3.7;if(distance<10)targetSpeed=Math.min(targetSpeed,Math.max(12,other.u-3));}}
    this.error=aggressive?Math.sin(time*.63+this.seed*7)*.4:Math.sin(time*.2+this.seed)*.09;
    targetLane=clamp(targetLane+this.error,-5.6,5.6);
    const desiredYaw=clamp((targetLane-p.d)/Math.max(12,look),-.20,.20);
    const localK=track.sample(p.s+look*.36).curvature;
    const wheelAngle=Math.atan(p.config.wheelbase*localK)+(desiredYaw-p.yaw)*.95-p.r*.06;
    return {steer:clamp(wheelAngle/(p.config.steer/(1+p.u/32)),-1,1),throttle:clamp((targetSpeed-p.u)*.3,0,1),brake:clamp((p.u-targetSpeed)*.19,0,.9),handbrake:this.personality==='drifter'&&Math.abs(curvature)>.018&&p.u>27,nitro:aggressive&&Math.abs(curvature)<.002&&gap>12};
  }
}

