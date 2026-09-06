import {clamp} from './physics.js';

/** Converts digital keys into progressive steering. Call at the physics timestep. */
export class DrivingInput {
  constructor() { this.reset(); }
  reset() { this.steer = 0; this.courseTrim = 0; }
  sample(input, speed, dt, config, vehicle) {
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
    let command = shaped * limit;
    if (vehicle && vehicle.assists !== false && !input.handbrake && speed > 6) {
      // Keyboard intent is a lateral course, not permanently accumulating yaw.
      // Releasing a key settles parallel to the road without snapping position.
      const curvature = vehicle.curvature || 0;
      const slip = Math.atan2(vehicle.v || 0, speed);
      const desiredCourse = Math.atan2(shaped * 2.8, speed);
      const error = desiredCourse - (vehicle.yaw || 0) - slip;
      const roadRate = curvature * speed;
      this.courseTrim = clamp(this.courseTrim + error * dt * .2, -.06, .06);
      const requestedRate = roadRate + error * (3.5 / (1 + speed / 70)) + this.courseTrim;
      const gripRate = Math.max(.5, vehicle.grip || config.grip) * 9.81 / speed;
      const desiredRate = clamp(requestedRate, -gripRate * .85, gripRate * .85);
      const angle = Math.atan(config.wheelbase * desiredRate / speed)
        + roadRate * speed * .0009 - ((vehicle.r || 0) - desiredRate) * .25;
      command = clamp(angle / availableAngle, -limit, limit);
    } else {
      this.courseTrim = 0;
    }
    return {...input, steer: command};
  }
}
