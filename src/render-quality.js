/** Explicit GPU budgets. Coarse-pointer balanced stays at one physical pixel per CSS pixel. */
export function renderQuality(value = 'balanced', {coarse = false, dpr = 1, maxSamples = 4, width = 1, height = 1} = {}) {
  const name = value === 'high' || value === 'low' ? value : 'balanced';
  const low = name === 'low', high = name === 'high';
  const deviceRatio=Math.min(Math.max(1,dpr),high?2:low||coarse?1:1.5);
  const pixelCap=coarse?Math.sqrt((high?1400000:low?600000:900000)/Math.max(1,width*height)):Infinity;
  return {
    name, pixelRatio: Math.min(deviceRatio,pixelCap),
    samples: low ? 0 : Math.min(maxSamples, high ? 4 : 2),
    bloomScale: low ? 0 : high ? 1 : .5,
    shadowSize: low ? 0 : high ? 2048 : coarse ? 768 : 1024,
    shadowFar: high ? 420 : coarse ? 220 : 300,
    shadowSplits: high ? [28, 110] : coarse ? [18, 65] : [22, 85],
    reflectionSize: low || (coarse && !high) ? 0 : high && !coarse ? 256 : 128,
    reflectionInterval: high ? (coarse ? 4 : 1.6) : 3.2,
  };
}

/** Changing samples needs target disposal even when CSS dimensions did not change. */
export function setComposerSamples(composer, samples) {
  for (const target of [composer.renderTarget1, composer.renderTarget2]) {
    if (target.samples !== samples) { target.dispose(); target.samples = samples; }
  }
}

/** Mobile balanced only. Sustained slow frames lower resolution, never physics.
 * Keep the reduced level until an explicit quality change to avoid oscillation.
 */
export class MobileResolution {
 constructor(){this.reset();}
 reset(){this.scale=1;this.warmup=3;this.elapsed=0;this.frames=0;this.slowWindows=0;}
 sample(dt,active){
  if(!active||!Number.isFinite(dt)||dt<=0||dt>.5){this.warmup=3;this.elapsed=0;this.frames=0;this.slowWindows=0;return false;}
  if(this.warmup>0){this.warmup-=dt;return false;}
  this.elapsed+=dt;this.frames++;
  if(this.elapsed<1.5)return false;
  const slow=this.frames/this.elapsed<45;this.elapsed=0;this.frames=0;
  this.slowWindows=slow?this.slowWindows+1:0;
  if(this.slowWindows<2||this.scale<=.72)return false;
  this.scale=this.scale>.85?.85:.72;this.slowWindows=0;return true;
 }
}
