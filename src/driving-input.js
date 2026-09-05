import {clamp} from './physics.js';

/** Converts digital keys into progressive steering. Call at the physics timestep. */
export class DrivingInput {
  constructor() { this.reset(); }
  reset() { this.steer = 0; }
  sample(input, speed, dt, config) {
    const target = clamp(input.steer || 0, -1, 1);
    const velocity = Math.abs(speed);
    const reversing = target * this.steer < 0;
    const rate = target === 0 ? 3.8 : reversing ? 4.6 : 2.6 / (1 + velocity / 65);
    this.steer += clamp(target - this.steer, -rate * dt, rate * dt);
    // A softer centre makes short taps useful for placing the car in its lane.
    const shaped = this.steer * (.38 + .62 * Math.abs(this.steer));
    const availableAngle = config.steer / (1 + velocity / 32);
    // Include tyre slip allowance, while reducing excess lock at motorway speeds.
    const cornerAngle = Math.atan(9.5 * config.wheelbase / (velocity * velocity + 40)) + .055;
    const speedLimit = Math.min(1, cornerAngle / availableAngle * (input.handbrake ? 1.4 : 1));
    const limit = 1 + (speedLimit - 1) * clamp((velocity - 8) / 12, 0, 1);
    return {...input, steer: shaped * limit};
  }
}
