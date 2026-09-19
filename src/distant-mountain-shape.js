// Static horizon geometry: broad landforms stay above the 28 x 21 m grid's
// sampling scale. Each range has its own watershed instead of repeated ribs.
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const hash = (x, z) => { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); };
function noise(x, z) {
 const ix = Math.floor(x), iz = Math.floor(z), u = smooth(0, 1, x - ix), v = smooth(0, 1, z - iz);
 return mix(mix(hash(ix, iz), hash(ix + 1, iz), u), mix(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
}

// x, elevation, position of the principal crest across its strip. Unequal
// valley widths and offset summits keep the three silhouettes independent.
const ranges = [
 { knots: [[-3200, 180, .47], [-2270, 410, .41], [-1510, 245, .55], [-720, 335, .49], [-80, 205, .35], [540, 485, .46], [1300, 270, .59], [2000, 440, .48], [2840, 220, .37], [3800, 335, .53]], peaks: [-2270, -720, 540, 2000], spread: 1 },
 { knots: [[-3200, 340, .52], [-2420, 240, .39], [-1670, 570, .49], [-730, 320, .62], [120, 465, .39], [950, 280, .47], [1600, 610, .56], [2510, 350, .45], [3300, 480, .35], [3800, 320, .43]], peaks: [-1670, 120, 1600, 3300], spread: -1 },
 { knots: [[-3200, 270, .38], [-2380, 470, .54], [-1480, 360, .43], [-380, 640, .59], [590, 345, .45], [1480, 520, .37], [2300, 320, .53], [3130, 585, .48], [3800, 350, .4]], peaks: [-2380, -380, 1480, 3130], spread: 1 },
];

function crestAt(x, layer) {
 const knots = ranges[layer].knots;
 let i = 0;
 while (i < knots.length - 2 && x > knots[i + 1][0]) i++;
 const a = knots[i], b = knots[i + 1], t = smooth(0, 1, (x - a[0]) / (b[0] - a[0]));
 const skyline = (noise(x / 205 + layer * 17, layer + 8) - .5) * 96;
 const spur = 1 - Math.abs(noise(x / 325 + layer * 5, layer + 3) * 2 - 1);
 const height = mix(a[1], b[1], t) + skyline + (spur - .6) * 48;
 const across = mix(a[2], b[2], t) + (noise(x / 780 + 9, layer * 11) - .5) * .09;
 return [height, across];
}
const branchRoots = ranges.map((range, layer) => range.peaks.map((x, i) => {
 const [height, across] = crestAt(x, layer);
 return { x, height, across, fans: [(-290 - i % 2 * 120) * range.spread, (220 + i % 3 * 95) * range.spread] };
}));

// Smooth maximum joins tributary ridges to the parent without intersections
// or extra geometry. Valleys remain broad enough for stable vertex normals.
function join(a, b, width = 34) {
 width = Math.min(width, b * .45);
 if (width < .000001) return Math.max(a, b);
 const h = Math.max(0, width - Math.abs(a - b)) / width;
 return Math.max(a, b) + h * h * width * .25;
}

export function distantRidgeHeight(x, z, across, layer) {
 if (across <= 0 || across >= 1) return 0;
 layer = clamp(Math.round(layer), 0, 2);
 const [crest, spine] = crestAt(x, layer);
 const front = across < spine;
 const t = front ? across / spine : (1 - across) / (1 - spine);
 // A steeper front escarpment and long reverse slope make a folded range,
 // rather than an extruded row of equal circular mountains.
 const tip = .035, rounded = (Math.sqrt(1 + tip * tip) - Math.sqrt((1 - t) ** 2 + tip * tip)) / (Math.sqrt(1 + tip * tip) - tip);
 let height = crest * clamp(rounded) ** (front ? 1.52 : 1.05);
 for (const root of branchRoots[layer]) {
  const u = across / root.across;
  if (u <= 0 || u >= 1.04) continue;
  const growth = Math.pow(clamp(u), .91) * (1 - smooth(.84, 1.04, u));
  for (let arm = 0; arm < root.fans.length; arm++) {
   const axis = root.x + root.fans[arm] * (1 - clamp(u)) ** 1.35 + Math.sin(u * Math.PI) * (arm ? 38 : -54);
   const width = 82 + (1 - clamp(u)) * 132;
   const d = (x - axis) / width;
   const branch = root.height * growth * Math.exp(-d * d * 1.25);
   height = join(height, branch);
  }
 }
 // Channels carve the existing body, so they cannot disappear beneath a
 // smooth envelope. Their courses bend and widen down-slope, instead of a
 // repeated sequence of straight vertical corrugations. 145--325 m source
 // scales remain resolved by several vertices on the existing grid.
 const flow = x + (noise(z / 510 + layer * 7, layer + 12) - .5) * 270;
 const channel = 1 - Math.abs(noise(flow / 215 + layer * 5, across * 1.7 + layer * 3) * 2 - 1);
 const cut = channel ** 1.7 * (40 + noise(x / 410, z / 500) * 32);
 const shoulders = (noise((x + flow * .14) / 155 + layer * 9, z / 195) - .5) * 50;
 const weathering = (shoulders - cut) * (.35 + .65 * Math.sin(Math.PI * across));
 const foothill = smooth(0, .08, across) * (1 - smooth(.90, 1, across));
 return clamp((height + weathering) * foothill, 0, 900);
}

// Linear RGB, baked once. Broad aspect and mineral transitions survive both
// mipmapping and far-distance haze; no per-vertex curvature freckles.
export function distantRidgeColor(x, y, z, nx, ny, nz, layer) {
 const patch = noise(x / 185 + layer * 7, z / 235);
 const geology = noise(x / 280 + z / 920, y / 120 + layer * 3);
 const strata = smooth(.24, .76, geology);
 const slope = 1 - clamp(Math.abs(ny));
 const exposed = clamp(smooth(.055, .38, slope) * .76 + smooth(120, 460, y) * .25 + (patch - .5) * .62);
 const north = clamp(.5 + nz * .6 - nx * .2);
 const vegetation = [mix(.065, .13, patch), mix(.083, .137, patch), mix(.045, .082, patch)];
 const limestone = [mix(.20, .37, strata), mix(.179, .324, strata), mix(.14, .255, strata)];
 const damp = 1 - north * (1 - exposed) * .16;
 return vegetation.map((value, i) => mix(value, limestone[i], exposed) * damp);
}
