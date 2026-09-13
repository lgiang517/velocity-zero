/** Explicit GPU budgets. Coarse-pointer balanced stays at one physical pixel per CSS pixel. */
export function renderQuality(value = 'balanced', {coarse = false, dpr = 1, maxSamples = 4} = {}) {
  const name = value === 'high' || value === 'low' ? value : 'balanced';
  const low = name === 'low', high = name === 'high';
  return {
    name, pixelRatio: Math.min(Math.max(1, dpr), high ? 2 : low || coarse ? 1 : 1.5),
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
