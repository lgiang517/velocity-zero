import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';

/** Composer owns pixel dimensions; scale every resize, not only the constructor resolution. */
export class QualityBloomPass extends UnrealBloomPass {
  setSize(width, height) {
    const scale = this.resolutionScale ?? .5;
    super.setSize(Math.max(32, Math.round(width * scale)), Math.max(32, Math.round(height * scale)));
  }
}
