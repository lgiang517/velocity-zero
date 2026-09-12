import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const random = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return v - Math.floor(v); };
const stoneColors = ['#92917e', '#7c8072', '#a39a81', '#737d72'];
const pineColors = ['#e0e1ce', '#becbb5', '#ece7d4', '#c7d2c2', '#d2d9c4'];
const boxGeometry = () => new THREE.BoxGeometry(1, 1, 1);
const standard = (color, roughness = .82, metalness = 0) => new THREE.MeshStandardMaterial({color, roughness, metalness, envMapIntensity: .3});

/** Spatial batches let the renderer discard whole groves and city blocks. */
function batch(world, name, geometry, material, items, {shadow = true, chunk = 550, trackItems = false} = {}) {
  if (!items.length) return [];
  const buckets = new Map();
  for (const item of items) {
    const key = chunk ? `${Math.floor(item.p.x / chunk)}:${Math.floor(item.p.z / chunk)}` : 'all';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }
  const transform = new THREE.Object3D();
  const result = [];
  for (const [key, group] of buckets) {
    const mesh = new THREE.InstancedMesh(geometry, material, group.length);
    mesh.name = `${name} ${key}`;
    group.forEach((item, index) => {
      transform.position.copy(item.p);
      transform.rotation.set(item.rx || 0, item.ry || 0, item.rz || 0, 'YXZ');
      if (item.quaternion) transform.quaternion.copy(item.quaternion);
      transform.scale.set(item.x ?? 1, item.y ?? 1, item.z ?? 1);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
      if (item.color) mesh.setColorAt(index, new THREE.Color(item.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (trackItems) mesh.userData.sourceItems = group;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = shadow;
    if (material.userData.foliageDepth) mesh.customDepthMaterial = material.userData.foliageDepth;
    mesh.receiveShadow = !(material.userData.foliageDepth || material.userData.noReceiveShadow);
    mesh.computeBoundingSphere();
    world.scene.add(mesh);
    result.push(mesh);
  }
  const triangles = (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
  world.sceneryStats.triangles += triangles * items.length;
  world.sceneryStats.instances += items.length;
  world.sceneryStats.batches += result.length;
  return result;
}

function geometryBuilder() {
  const positions = [], colors = [], indices = [];
  return {
    hull(points, faces, shade = () => [1, 1, 1]) {
      const offset = positions.length / 3;
      points.forEach((point, i) => { positions.push(...point); colors.push(...shade(point, i)); });
      for (const face of faces) for (let i = 1; i < face.length - 1; i++) indices.push(offset + face[0], offset + face[i], offset + face[i + 1]);
    },
    finish() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      return geometry;
    }
  };
}

// A connected crown carries the tree's volume. Unequal, gently twisted rings
// describe tapering bough groups rather than a stack of isolated cones or cards.
function pineCoreGeometry(detailed = false) {
  const builder = geometryBuilder(), points = [], faces = [], sides = detailed ? 9 : 6;
  const sections = detailed ? [[.20,.12],[.34,.20],[.49,.188],[.65,.143],[.81,.082],[.945,.028]] : [[.23,.24],[.41,.20],[.60,.145],[.79,.085],[.945,.028]];
  sections.forEach(([height,radius], ring) => {
    for (let i = 0; i < sides; i++) {
      const angle = i / sides * TAU + Math.sin(ring * .83) * .19;
      const lobe = (.84 + Math.sin(angle * 3 + ring * 1.47) * .18 + Math.cos(angle * 2 - ring * .7) * .09) * (detailed ? .59 : 1);
      points.push([Math.cos(angle) * radius * lobe + Math.sin(height * 5) * .008, height + Math.sin(angle * 3.1 + ring) * .019, Math.sin(angle) * radius * lobe + Math.cos(height * 4) * .011]);
    }
  });
  for (let ring = 0; ring < sections.length - 1; ring++) for (let i = 0; i < sides; i++) {
    const a = ring * sides + i, b = ring * sides + (i + 1) % sides;
    faces.push([a, a + sides, b + sides, b]);
  }
  const bottom = points.length;points.push([0,.20,0]);
  const top = points.length;points.push([.004,1.035,-.007]);
  for (let i = 0; i < sides; i++) {
    faces.push([bottom, i, (i + 1) % sides]);
    faces.push([top, (sections.length - 1) * sides + (i + 1) % sides, (sections.length - 1) * sides + i]);
  }
  const shade = point => {
    const variation = .87 + point[1] * .18 + Math.sin(point[0] * 42 + point[2] * 39) * .07;
    return [.13 * variation, .22 * variation, .145 * variation];
  };
  builder.hull(points, faces, shade);
  if (detailed) {
    const ico = new THREE.IcosahedronGeometry(1, 0), source = ico.attributes.position;
    for (let tier = 0; tier < 10; tier++) for (let branch = 0; branch < 3; branch++) {
      const taper = 1 - tier * .080;
      const angle = branch * TAU / 3 + tier * 1.91 + Math.sin(tier*1.43+branch)*.16;
      const irregularLength = .89 + random(tier*13+branch+846)*.25;
      const radius = .080 * taper + .015, length = .17 * taper * irregularLength;
      const width = .090 * taper + .015, tall = .055 * (1-tier*.06) + .010, centreY = .23 + tier * .074 + Math.sin(tier*1.89+branch*.94)*.017;
      const tuft = [], tuftFaces = [], lookup = new Map(), corners = [];
      for (let i = 0; i < source.count; i++) {
        const x = source.getX(i), y = source.getY(i), z = source.getZ(i), key = `${x.toFixed(5)}:${y.toFixed(5)}:${z.toFixed(5)}`;
        if (!lookup.has(key)) {
          const uneven = 1 + Math.sin(x * 5 + z * 3 + tier) * .12 + Math.cos(y * 4 + branch) * .09;
          const radial = radius + x * length * uneven, transverse = z * width * uneven;
          lookup.set(key, tuft.length);
          tuft.push([Math.cos(angle) * radial - Math.sin(angle) * transverse, centreY + y * tall * uneven - x * .021, Math.sin(angle) * radial + Math.cos(angle) * transverse]);
        }
        corners.push(lookup.get(key));if (i % 3 === 2) tuftFaces.push(corners.slice(-3));
      }
      builder.hull(tuft, tuftFaces, shade);
    }
    ico.dispose();
  }
  return builder.finish();
}

// Only short, needle-edged sprays sit at the outside of the solid crown. Their
// real-world size is under 1.5 m, so individual textures never become giant leaves.
function pineCrownGeometry() {
  const positions = [], normals = [], uvs = [], colors = [], indices = [];
  for (let i = 0; i < 8; i++) {
    const tier = i < 3 ? 0 : i < 6 ? 1 : 2;
    const height = [.36,.60,.79][tier], rootRadius = [.155,.118,.061][tier], length = [.103,.089,.063][tier];
    const angle = i * 2.399 + tier * .42, cant = .48 * Math.sin(i * 2.1);
    const root = new THREE.Vector3(Math.cos(angle) * rootRadius, height, Math.sin(angle) * rootRadius);
    const direction = new THREE.Vector3(Math.cos(angle) * length,-.019,Math.sin(angle) * length);
    const across = new THREE.Vector3(-Math.sin(angle) * Math.cos(cant),Math.sin(cant),Math.cos(angle) * Math.cos(cant));
    const base = positions.length / 3;
    for (const u of [0,1]) for (const edge of [-1,1]) {
      const point = root.clone().addScaledVector(direction,u).addScaledVector(across,edge * length * .39);
      positions.push(point.x,point.y,point.z);
      const normal = new THREE.Vector3(point.x,.24,point.z).normalize();normals.push(normal.x,normal.y,normal.z);
      uvs.push(u,(edge+1)/2);colors.push(.93,.97,.94);
    }
    indices.push(base,base+2,base+1,base+1,base+2,base+3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);
  return geometry;
}

function pineCoreMaterial() {
  const mat = standard('#ffffff',.98);
  mat.vertexColors = true;mat.envMapIntensity = .09;mat.userData.noReceiveShadow = true;
  mat.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vFirP;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFirP=position;');
    shader.fragmentShader = 'varying vec3 vFirP;\n' + surfaceNoise + '\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float needles=coastNoise(vFirP.xy*113.)*.38+coastNoise(vFirP.yz*127.)*.34+coastNoise(vFirP.xz*149.)*.28;
      float boughs=coastNoise(vFirP.xy*23.+vFirP.z*7.)*.5+coastNoise(vFirP.yz*21.)*.5;
      diffuseColor.rgb*=.72+needles*.42+boughs*.20;`);
  };
  mat.customProgramCacheKey = () => 'coastal-fir-solid-volume-v4';
  return mat;
}

// Native procedural rasterization avoids external image dependencies. The
// texture contains only a twig and its needles, with fully clear space between.
let firNeedleMap;
function needleTexture() {
  if (firNeedleMap) return firNeedleMap;
  const width = 512, height = 256, pixels = new Uint8Array(width * height * 4);
  function stroke(ax, ay, bx, by, radius, color) {
    const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
    const minX = Math.max(0, Math.floor(Math.min(ax, bx) - radius - 1)), maxX = Math.min(width - 1, Math.ceil(Math.max(ax, bx) + radius + 1));
    const minY = Math.max(0, Math.floor(Math.min(ay, by) - radius - 1)), maxY = Math.min(height - 1, Math.ceil(Math.max(ay, by) + radius + 1));
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const t = length2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length2)) : 0;
      const alpha = Math.max(0, Math.min(1, radius + .65 - Math.hypot(x - ax - dx * t, y - ay - dy * t)));
      if (alpha <= 0) continue;
      const index = (y * width + x) * 4, old = pixels[index + 3] / 255;
      const combined = alpha + old * (1 - alpha);
      for (let c = 0; c < 3; c++) pixels[index + c] = (color[c] * alpha + pixels[index + c] * old * (1 - alpha)) / combined;
      pixels[index + 3] = combined * 255;
    }
  }
  const palette = [[75, 105, 72], [99, 129, 86], [120, 146, 103], [65, 93, 66], [87, 117, 80]];
  stroke(18, 141, 490, 117, 2.1, [101, 98, 63]);
  for (let twig = 0; twig < 24; twig++) for (const side of [-1, 1]) {
    const t = twig / 24, x = 40 + t * 436, y = 140 - t * 22;
    const length = (42 + Math.sin(Math.PI * t) * 47) * (.80 + random(twig + side + 402) * .29);
    const tx = x + length * (.41 + random(twig + 829) * .18), ty = y + side * length;
    stroke(x, y, tx, ty, .95, [100, 110, 66]);
    for (let cluster = 0; cluster < 10; cluster++) {
      const u = cluster / 10, px = x + (tx - x) * u, py = y + (ty - y) * u;
      for (let needle = 0; needle < 8; needle++) {
        const n = twig * 193 + cluster * 11 + needle + (side + 1) * 997;
        const spread = (needle / 7 - .5) * 2.15, angle = Math.atan2(ty - y, tx - x) + spread;
        const size = (8.5 + random(n + 407) * 8) * (1 - u * .28);
        const ox = (random(n + 61) - .5) * 5, oy = (random(n + 27) - .5) * 4;
        stroke(px + ox, py + oy, px + ox + Math.cos(angle) * size, py + oy + Math.sin(angle) * size, 1.0 + random(n + 26) * .55, palette[n % palette.length]);
      }
    }
  }
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  texture.name = 'Procedural coastal fir needles';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  firNeedleMap = texture;
  return texture;
}

function broadleafGeometry() {
  const builder = geometryBuilder();
  const clusters = [[-.18, .62, .03, .19], [.18, .67, .01, .23], [.03, .86, -.11, .20], [-.10, .83, .17, .18], [.19, .84, .16, .16], [-.20, .77, -.12, .17], [.02, .66, -.20, .20], [.015, .99, .03, .14]];
  clusters.forEach(([x, y, z, size], cluster) => {
    const ico = new THREE.IcosahedronGeometry(1, 1), a = ico.attributes.position;
    const points = [], faces = [], lookup = new Map(), cornerIndices = [];
    // Shared vertices produce smooth normals across every subdivided cluster.
    for (let i = 0; i < a.count; i++) {
      const px = a.getX(i), py = a.getY(i), pz = a.getZ(i);
      const key = `${px.toFixed(5)}:${py.toFixed(5)}:${pz.toFixed(5)}`;
      if (!lookup.has(key)) {
        const irregular = 1 + Math.sin(px * 6 + pz * 4 + cluster) * .16 + Math.cos(py * 7 + cluster) * .09;
        lookup.set(key, points.length);
        points.push([x + px * size * irregular, y + py * size * irregular * .89, z + pz * size * irregular]);
      }
      cornerIndices.push(lookup.get(key));
      if (i % 3 === 2) faces.push(cornerIndices.slice(-3));
    }
    builder.hull(points, faces, p => { const tint = .69 + (p[1] - .4) * .35; return [tint * .59, tint * .69, tint * .40]; });
    ico.dispose();
  });
  return builder.finish();
}

function grassGeometry() {
  const builder = geometryBuilder();
  for (let i = 0; i < 6; i++) {
    const angle = i * 2.4, x = Math.cos(angle) * .17, z = Math.sin(angle) * .17;
    const h = .45 + random(i + 7) * .5, w = .025 + random(i + 12) * .018;
    const leanX = Math.cos(angle) * .31, leanZ = Math.sin(angle) * .31;
    builder.hull([[x - w, 0, z], [x + w, 0, z], [x + leanX * .4 + w * .4, h * .58, z + leanZ * .4], [x + leanX, h, z + leanZ]], [[0, 1, 2], [0, 2, 3]], (p, j) => j < 2 ? [.21, .29, .12] : [.50 + i % 2 * .08, .50, .22]);
  }
  return builder.finish();
}

function foliageMaterial(world, grass = false, broadleaf = false) {
  const mat = standard('#ffffff', .95);
  mat.vertexColors = true;
  mat.envMapIntensity = .12;
  if (!grass && !broadleaf) {
    mat.map = needleTexture();
    mat.side = THREE.DoubleSide;
    mat.alphaTest = .27;
    mat.alphaToCoverage = true;
    mat.transparent = false;
    mat.depthWrite = true;
    mat.userData.foliageDepth = new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking, map: mat.map, alphaTest: mat.alphaTest, side: THREE.DoubleSide});
    // A leaf card has one canopy normal for both visible sides. Flipping that
    // already volumetric normal on backfaces makes alternating black branches.
    mat.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
    };
    mat.emissive.set('#344d35');
    mat.emissiveIntensity = .14;
    mat.customProgramCacheKey = () => 'coastal-fir-two-sided-volume-v3';
  }
  if (broadleaf) {
    mat.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec3 vLeafP;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLeafP=position;');
      shader.fragmentShader = 'varying vec3 vLeafP;\n' + surfaceNoise + '\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float leafDetail=coastNoise(vLeafP.xz*89.+vLeafP.y*19.);
        float canopyShade=coastNoise(vLeafP.xz*13.+vLeafP.y*4.);
        diffuseColor.rgb*=.75+leafDetail*.38+canopyShade*.18;`);
    };
    mat.customProgramCacheKey = () => 'coastal-broadleaf-detail-v2';
  }
  if (grass) {
    mat.side = THREE.DoubleSide;
    mat.onBeforeCompile = shader => {
      shader.uniforms.coastTime = world.uniforms.time;
      shader.vertexShader = 'uniform float coastTime;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float phase = 0.;
        #ifdef USE_INSTANCING
          phase = instanceMatrix[3].x * .15 + instanceMatrix[3].z * .11;
        #endif
        transformed.x += sin(coastTime * 1.65 + phase) * .08 * position.y * position.y;
        transformed.z += cos(coastTime * 1.13 + phase) * .045 * position.y * position.y;`);
    };
    mat.customProgramCacheKey = () => 'coastal-grass-sway-v1';
  }
  return mat;
}

function rockGeometry() {
  const geometry = new THREE.IcosahedronGeometry(1, 1), a = geometry.attributes.position, colors = [];
  for (let i = 0; i < a.count; i++) {
    const x = a.getX(i), y = a.getY(i), z = a.getZ(i);
    const ridge = 1 + Math.sin(x * 7 + z * 4) * .12 + Math.cos(y * 9 + z) * .08;
    a.setXYZ(i, x * ridge, y * (.87 + Math.sin(z * 4) * .07), z * ridge);
    const light = .65 + (y + 1) * .12 + Math.sin(x * 9 + z * 6) * .045;
    colors.push(light, light * .99, light * .90);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const surfaceNoise = `
float coastHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float coastNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(coastHash(i),coastHash(i+vec2(1,0)),f.x),mix(coastHash(i+vec2(0,1)),coastHash(i+vec2(1,1)),f.x),f.y);}`;

function stoneMaterial() {
  const mat = standard('#ffffff', .94);
  mat.vertexColors = true;
  mat.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vStoneP;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvStoneP=position;');
    shader.fragmentShader = 'varying vec3 vStoneP;\n' + surfaceNoise + '\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float grit=coastNoise(vStoneP.xz*19.);
      float layers=coastNoise(vec2(vStoneP.x*4.+vStoneP.z*3.,vStoneP.y*21.+grit*.7));
      diffuseColor.rgb*=.78+layers*.29+grit*.13;`);
  };
  mat.customProgramCacheKey = () => 'coastal-stone-v1';
  return mat;
}

// Coordinates are in real metres even when each instanced building has a
// different height. Floor spacing therefore does not stretch with skyscrapers.
function architecturalMaterial({container = false} = {}) {
  const mat = standard(container ? '#dad4c8' : '#d2d0be', container ? .78 : .71, container ? .22 : .12);
  if (!container) {
    mat.emissive.set('#ffdc9f');
    mat.emissiveIntensity = .05;
  }
  mat.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vArchP;varying vec3 vArchN;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 coastScale=vec3(1.);
      #ifdef USE_INSTANCING
        coastScale=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
      #endif
      vArchP=position*coastScale;vArchN=normal;`);
    shader.fragmentShader = 'varying vec3 vArchP;varying vec3 vArchN;\n' + surfaceNoise + '\n' + shader.fragmentShader;
    if (container) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float side=step(.5,abs(vArchN.x));
        float axis=mix(vArchP.x,vArchP.z,side);
        float ribs=smoothstep(.12,.20,abs(fract(axis*3.6)-.5));
        float grime=coastNoise(vArchP.xz*1.7+vArchP.y*2.1);
        float edge=1.-smoothstep(1.06,1.29,abs(vArchP.y));
        diffuseColor.rgb*=mix(.66,.98,ribs)*(.86+grime*.16)*mix(.64,1.,edge);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.20,.092,.039),step(.86,grime)*.17);`);
    } else {
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float side=step(.5,abs(vArchN.x));
        float axis=mix(vArchP.x,vArchP.z,side);
        vec2 facade=vec2(axis,vArchP.y);
        vec2 cell=fract((facade+vec2(1.17,100.))/vec2(3.05,3.35));
        float coastWindow=smoothstep(.13,.17,cell.x)*(1.-smoothstep(.82,.86,cell.x))*smoothstep(.19,.23,cell.y)*(1.-smoothstep(.74,.78,cell.y));
        coastWindow*=1.-step(.5,abs(vArchN.y));
        float row=coastHash(floor((facade+vec2(1.17,100.))/vec2(3.05,3.35)));
        vec3 glazing=mix(vec3(.055,.096,.107),vec3(.18,.25,.26),row);
        glazing*=.8+smoothstep(.23,.75,cell.y)*.3;
        float ledge=1.-smoothstep(.02,.08,abs(cell.y-.81));
        vec3 facadeBase=diffuseColor.rgb*(.93-ledge*.19);
        diffuseColor.rgb=mix(facadeBase,glazing,coastWindow);
        float coastLampMask=coastWindow*step(.63,row)*(.5+row*.5);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=mix(.79,.25,coastWindow);');
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance*=coastLampMask;');
    }
  };
  mat.customProgramCacheKey = () => container ? 'coastal-corrugated-container-v1' : 'coastal-metre-facade-v1';
  return mat;
}

/** Conservative horizontal clearance includes nearby switchback segments. */
function placementTools(world) {
  const track = world.track;
  const samples = track.samples.filter((_, i) => i % 4 === 0);
  if (samples.at(-1) !== track.samples.at(-1)) samples.push(track.samples.at(-1));
  function nearestRoad(p) {
    let min = Infinity, fraction = 0;
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i].p, b = samples[i + 1].p;
      const dx = b.x - a.x, dz = b.z - a.z;
      const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
      const distance = (p.x - a.x - u * dx) ** 2 + (p.z - a.z - u * dz) ** 2;
      if (distance < min) { min = distance; fraction = (i + u) / (samples.length - 1); }
    }
    return {distance: Math.sqrt(min), fraction};
  }
  function land(s, lateral, radius = 1, {vegetation = false} = {}) {
    const p = track.point(s, lateral, 0), near = nearestRoad(p);
    if (near.distance < 14.7 + radius) return null;
    if (near.fraction > .896 && near.fraction < .997) return null;
    if (vegetation && near.fraction > .213 && near.fraction < .268) return null;
    p.y = world.groundHeight(p.x, p.z);
    if (!Number.isFinite(p.y) || p.y < -1.5) return null;
    return p;
  }
  return {land};
}

function buildVegetation(world, place) {
  const track = world.track, pines = [], broadleaves = [], trunks = [], grass = [], rocks = [];
  // Uneven grove centres leave alternating near/far openings toward the bay.
  for (let i = 0; i < 1200 && pines.length < 440; i++) {
    const t = i % 8 === 0 ? .785 + random(i + 37) * .097 : .009 + random(i * 3.19) * .49;
    const s = t * track.length, side = random(i + 11) > .24 ? 1 : -1;
    const h = 7 + random(i + 83) * 12, grove = random(Math.floor(i / 8) + 611);
    const lateral = side * (23 + grove * 88 + random(i + 71) * 18);
    const p = place.land(s, lateral, h * .31, {vegetation: true});
    if (!p) continue;
    const angle = random(i + 214) * TAU;
    pines.push({p, x: h * (.84 + random(i + 9) * .21), y: h, z: h * (.88 + random(i + 82) * .20), ry: angle, color: pineColors[i % pineColors.length]});
    trunks.push({p: p.clone().add(new THREE.Vector3(0, h * .35, 0)), x: h * .019, y: h * .70, z: h * .019, ry: angle});
  }
  for (let i = 0; i < 280 && broadleaves.length < 65; i++) {
    const t = i % 3 ? random(i * 1.32 + 7) * .18 : .49 + random(i + 88) * .14;
    const h = 4.7 + random(i + 711) * 5.1, side = i % 5 ? 1 : -1;
    const p = place.land(t * track.length, side * (25 + random(i + 71) * 48), h * .44, {vegetation: true});
    if (!p) continue;
    broadleaves.push({p, x: h, y: h, z: h * .9, ry: random(i + 451) * TAU, color: '#9ba779'});
    trunks.push({p: p.clone().add(new THREE.Vector3(0, h * .28, 0)), x: h * .026, y: h * .57, z: h * .026, rz: .055 * Math.sin(i)});
  }
  for (let i = 0; i < 2100 && grass.length < 1050; i++) {
    const s = random(i * 3.71 + 10) * track.length, side = i % 4 === 0 ? -1 : 1;
    const p = place.land(s, side * (20.9 + random(i + 713) * 16), .55, {vegetation: true});
    if (!p) continue;
    const scale = .55 + random(i + 581) * 1.35;
    grass.push({p, x: scale * (1 + random(i + 884)), y: scale, z: scale, ry: random(i + 51) * TAU, color: i % 4 ? '#b6b689' : '#cbc1a0'});
  }
  for (let i = 0; i < 440 && rocks.length < 135; i++) {
    const s = random(i * 4.7 + 99) * track.length, side = i % 3 ? 1 : -1;
    const radius = 1.0 + random(i + 712) * 3.4;
    const p = place.land(s, side * (23 + random(i + 882) * 24), radius * 1.3, {vegetation: true});
    if (!p) continue;
    p.y -= radius * .22;
    rocks.push({p, x: radius * (1 + random(i + 888) * .6), y: radius * (.65 + random(i + 2) * .7), z: radius, ry: random(i + 556) * TAU, rx: .23 * Math.sin(i), color: stoneColors[i % stoneColors.length]});
  }
  const firMaterial = pineCoreMaterial();
  const firBatches = batch(world, 'Continuous coastal fir crowns', pineCoreGeometry(), firMaterial, pines, {trackItems: true});
  installFirLod(world, pines, firBatches, firMaterial);
  batch(world, 'Coastal fir needle edges', pineCrownGeometry(), foliageMaterial(world), pines);
  batch(world, 'Wind-shaped broadleaf crowns', broadleafGeometry(), foliageMaterial(world, false, true), broadleaves);
  batch(world, 'Tree trunks', new THREE.CylinderGeometry(.46, 1, 1, 5), standard('#655540', .98), trunks);
  batch(world, 'Dune and shoulder tussocks', grassGeometry(), foliageMaterial(world, true), grass, {shadow: false});
  batch(world, 'Fractured coastal boulders', rockGeometry(), stoneMaterial(), rocks);
  world.sceneryStats.trees = pines.length + broadleaves.length;
  world.sceneryStats.grassClumps = grass.length;
}

// Keep detailed bough geometry on nearby visible trees instead of paying for
// it across the whole map. Updates only when the camera moves at least 3 m.
function installFirLod(world, pines, farBatches, material) {
  const limit = 20, geometry = pineCoreGeometry(true), near = new THREE.InstancedMesh(geometry, material, limit);
  near.name = 'Nearby fir bough clusters';near.count = 0;near.castShadow = true;near.receiveShadow = false;
  world.scene.add(near);
  const farTriangles = farBatches[0].geometry.index.count / 3;
  world.sceneryStats.triangles += (geometry.index.count / 3 - farTriangles) * limit;
  world.sceneryStats.batches += 1;
  world.sceneryStats.nearFirLimit = limit;
  const sourceMatrices = new Map(farBatches.map(mesh => [mesh, mesh.instanceMatrix.array.slice()]));
  const lastPosition = new THREE.Vector3(Infinity, Infinity, Infinity), direction = new THREE.Vector3(), matrix = new THREE.Matrix4(), color = new THREE.Color();
  const prior = world.scene.onBeforeRender;
  world.scene.onBeforeRender = function(renderer, scene, camera, ...rest) {
    prior.call(this, renderer, scene, camera, ...rest);
    if (camera.position.distanceToSquared(lastPosition) < 9) return;
    lastPosition.copy(camera.position);camera.getWorldDirection(direction);
    const candidates = [];
    for (const item of pines) {
      const dx = item.p.x - camera.position.x, dz = item.p.z - camera.position.z, distance = dx * dx + dz * dz;
      if (distance < 190 * 190 && dx * direction.x + dz * direction.z > -18) candidates.push({item, distance});
    }
    candidates.sort((a,b) => a.distance - b.distance);
    const selected = new Set(candidates.slice(0, limit).map(c => c.item));
    let nearCount = 0;
    for (const mesh of farBatches) {
      const source = sourceMatrices.get(mesh);let count = 0;
      mesh.userData.sourceItems.forEach((item, i) => {
        matrix.fromArray(source, i * 16);color.set(item.color);
        if (selected.has(item)) { near.setMatrixAt(nearCount, matrix);near.setColorAt(nearCount++, color); }
        else { mesh.setMatrixAt(count, matrix);mesh.setColorAt(count++, color); }
      });
      mesh.count = count;mesh.instanceMatrix.needsUpdate = true;if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    near.count = nearCount;near.instanceMatrix.needsUpdate = true;if (near.instanceColor) near.instanceColor.needsUpdate = true;
    near.computeBoundingSphere();world.sceneryStats.nearFirs = nearCount;
  };
}

function buildCity(world, place) {
  const bodies = [], stone = [], dark = [], trim = [], glass = [];
  const footprint = [];
  const facadeColors = ['#c0c1ac', '#909c94', '#d0c8b3', '#a3aea4', '#7d9390'];
  // A mix of waterfront mid-rise and a smaller inland tower cluster gives the
  // city a legible skyline; real roof volumes catch the low evening sunlight.
  for (let i = 0; i < 170 && bodies.length < 84; i++) {
    const t = .482 + random(i * 2.72 + 11) * .19, s = t * world.track.length;
    const side = i % 4 === 0 ? -1 : 1;
    const width = 12 + random(i + 19) * 15, depth = 14 + random(i + 197) * 17;
    const lateral = side * (43 + random(i + 182) * 150), radius = Math.hypot(width, depth) * .52;
    const p = place.land(s, lateral, radius);
    if (!p || footprint.some(q => q.p.distanceToSquared(p) < (q.radius + radius + 4) ** 2)) continue;
    const heading = world.track.sample(s).heading;
    const tower = side > 0 && Math.abs(lateral) > 120 && i % 3 === 0;
    const floors = tower ? 14 + Math.floor(random(i + 808) * 13) : 4 + Math.floor(random(i + 707) * 8);
    const height = floors * 3.35 + 1.4;
    const color = facadeColors[i % facadeColors.length];
    const at = (x, y, z) => new THREE.Vector3(x, y, z).applyAxisAngle(UP, heading).add(p);
    bodies.push({p: at(0, height / 2, 0), x: width, y: height, z: depth, ry: heading, color});
    footprint.push({p, radius});
    // Shadowed entrance plinth, projecting roof and a recessed rooftop plant.
    stone.push({p: at(0, .8, 0), x: width + .7, y: 1.6, z: depth + .7, ry: heading, color: '#777e73'});
    trim.push({p: at(0, height + .13, 0), x: width + .5, y: .26, z: depth + .5, ry: heading, color});
    dark.push({p: at(0, height + .3, 0), x: width - 1.1, y: .15, z: depth - 1.1, ry: heading});
    stone.push({p: at(width * .17, height + 1.1, depth * .10), x: width * .29, y: 1.8, z: depth * .3, ry: heading, color: '#8e9588'});
    dark.push({p: at(width * .17, height + 2.04, depth * .1), x: width * .23, y: .10, z: depth * .23, ry: heading});
    if (tower) {
      stone.push({p: at(-width * .19, height + 3.1, -depth * .08), x: width * .28, y: 5.9, z: depth * .33, ry: heading, color});
      trim.push({p: at(-width * .19, height + 6.11, -depth * .08), x: width * .3, y: .15, z: depth * .35, ry: heading, color: '#ced0bf'});
    }
    if (i % 3 === 0) {
      // Shallow vertical fins break up broad facades without a second shell.
      for (const x of [-.36, .36]) trim.push({p: at(width * x, height / 2, depth / 2 + .18), x: .25, y: height + .2, z: .65, ry: heading, color});
    }
    glass.push({p: at(0, 2.2, depth / 2 + .04), x: width * .44, y: 3.1, z: .14, ry: heading});
    trim.push({p: at(0, 3.91, depth / 2 + 1.1), x: width * .52, y: .20, z: 2.4, ry: heading, color});
  }
  world.buildingMaterial = architecturalMaterial();
  batch(world, 'City facades', boxGeometry(), world.buildingMaterial, bodies, {chunk: 700});
  batch(world, 'Podiums and rooftop service rooms', boxGeometry(), standard('#d3d1c1', .84), stone, {chunk: 700});
  batch(world, 'Roof coping and facade fins', boxGeometry(), standard('#ceceba', .6, .13), trim, {chunk: 700});
  batch(world, 'Roof membranes and ventilation', boxGeometry(), standard('#394842', .94), dark, {chunk: 700});
  batch(world, 'Lobby glazing', boxGeometry(), standard('#263e43', .21, .35), glass, {chunk: 700});
  world.sceneryStats.buildings = bodies.length;
}

function beam(items, a, b, width, depth = width, color) {
  const delta = b.clone().sub(a);
  items.push({p: a.clone().add(b).multiplyScalar(.5), x: width, y: delta.length(), z: depth, quaternion: new THREE.Quaternion().setFromUnitVectors(UP, delta.normalize()), color});
}

function buildPort(world, place) {
  const containers = [], hardware = [], cranes = [], cables = [], cabins = [];
  for (let i = 0; i < 50; i++) {
    const s = world.track.length * (.69 + Math.floor(i / 5) * .0065);
    const p = place.land(s, 29 + i % 5 * 10.5, 6.7);
    if (!p) continue;
    const heading = world.track.sample(s).heading;
    const at = (x, y, z) => new THREE.Vector3(x, y, z).applyAxisAngle(UP, heading).add(p);
    const layers = i % 4 === 0 ? 3 : i % 3 === 0 ? 2 : 1;
    for (let level = 0; level < layers; level++) {
      containers.push({p: at(0, 1.32 + level * 2.68, 0), x: 2.44, y: 2.59, z: 12.19, ry: heading, color: ['#92664a', '#517e78', '#a69869', '#586d80', '#ab664c'][(i + level) % 5]});
      for (const x of [-1.05, 1.05]) hardware.push({p: at(x, 1.32 + level * 2.68, -6.11), x: .065, y: 2.34, z: .06, ry: heading});
    }
  }
  for (let i = 0; i < 4; i++) {
    const s = world.track.length * (.704 + i * .017);
    const p = place.land(s, 115, 42);
    if (!p) continue;
    const heading = world.track.sample(s).heading;
    const at = (x, y, z) => new THREE.Vector3(x, y, z).applyAxisAngle(UP, heading).add(p);
    for (const x of [-7, 7]) for (const z of [-5, 5]) {
      beam(cranes, at(x, 0, z), at(x * .64, 34, z), 1.0, 1.1);
      hardware.push({p: at(x, .45, z), x: 2.3, y: .9, z: 2.8, ry: heading});
    }
    for (const z of [-5, 5]) {
      beam(cranes, at(-7, 7, z), at(5, 29, z), .32);
      beam(cranes, at(7, 7, z), at(-5, 29, z), .32);
      beam(cranes, at(-28, 34, z), at(27, 34, z), .8, .7);
      beam(cranes, at(-28, 38, z), at(27, 38, z), .55, .55);
      for (let segment = 0; segment < 7; segment++) {
        const x = -28 + segment * 7.85;
        beam(cranes, at(x, segment % 2 ? 38 : 34, z), at(x + 7.85, segment % 2 ? 34 : 38, z), .29);
      }
      beam(cables, at(-23, 34, z), at(-23, 12, z), .055);
    }
    for (const x of [-28, -7, 7, 27]) beam(cranes, at(x, 34, -5), at(x, 34, 5), .65);
    beam(cranes, at(-23, 12, -5), at(-23, 12, 5), .75);
    cabins.push({p: at(-7, 32, 4.6), x: 3.4, y: 2.8, z: 3.1, ry: heading});
  }
  batch(world, 'Corrugated freight containers', boxGeometry(), architecturalMaterial({container: true}), containers, {chunk: 700});
  batch(world, 'Freight locks and crane bogies', boxGeometry(), standard('#4b5750', .54, .62), hardware, {chunk: 700});
  batch(world, 'Harbour crane lattice', boxGeometry(), standard('#b39c63', .63, .36), cranes, {chunk: 700});
  batch(world, 'Crane lifting cables', boxGeometry(), standard('#343f3c', .56, .65), cables, {chunk: 700, shadow: false});
  batch(world, 'Crane operator cabins', boxGeometry(), standard('#3c5557', .29, .23), cabins, {chunk: 700});
}

function turbineRotorGeometry() {
  const builder = geometryBuilder();
  const sections = [[1.2, .42, .05], [4.2, 1.14, .10], [10.5, .9, .04], [17.4, .49, -.03], [23, .07, -.11]];
  for (let blade = 0; blade < 3; blade++) {
    const angle = blade * TAU / 3, points = [], faces = [];
    for (const [radius, width, twist] of sections) for (const [x, z] of [[-width * .38, -.13], [width * .62, -.065], [width * .55, .14], [-width * .31, .10]]) {
      const sweep = radius * radius * .0015;
      points.push([(x + sweep) * Math.cos(angle) - radius * Math.sin(angle), (x + sweep) * Math.sin(angle) + radius * Math.cos(angle), z + twist]);
    }
    for (let i = 0; i < sections.length - 1; i++) for (let j = 0; j < 4; j++) faces.push([i * 4 + j, i * 4 + (j + 1) % 4, (i + 1) * 4 + (j + 1) % 4, (i + 1) * 4 + j]);
    faces.push([3, 2, 1, 0], [16, 17, 18, 19]);
    builder.hull(points, faces);
  }
  return builder.finish();
}

function buildTurbines(world, place) {
  const towers = [], nacelles = [], rotors = [];
  const mat = standard('#d8d8c5', .54, .12);
  const rotorGeometry = turbineRotorGeometry(), hubGeometry = new THREE.SphereGeometry(1.0, 8, 6);
  world.turbines = [];
  for (let i = 0; i < 7; i++) {
    const s = world.track.length * (.787 + i * .014);
    const p = place.land(s, 90 + (i % 2) * 32, 27);
    if (!p) continue;
    const heading = world.track.sample(s).heading;
    const height = 57 + i % 3 * 4;
    towers.push({p: p.clone().add(new THREE.Vector3(0, height / 2, 0)), x: 1.65, y: height, z: 1.65});
    nacelles.push({p: p.clone().add(new THREE.Vector3(0, height, 0)), x: 2.35, y: 2.1, z: 5.1, ry: heading});
    const group = new THREE.Group();group.name = 'Swept turbine rotor';
    group.position.copy(p).add(new THREE.Vector3(-Math.sin(heading) * 3, height, -Math.cos(heading) * 3));
    group.rotation.y = heading;
    const rotor = new THREE.Group();rotor.rotation.z = i * 1.7;
    const blades = new THREE.Mesh(rotorGeometry, mat);blades.castShadow = true;rotor.add(blades);
    const hub = new THREE.Mesh(hubGeometry, mat);hub.scale.z = 1.5;rotor.add(hub);
    group.add(rotor);world.scene.add(group);world.turbines.push(rotor);rotors.push(rotor);
  }
  batch(world, 'Tapered turbine towers', new THREE.CylinderGeometry(.39, 1, 1, 9), mat, towers, {chunk: 700});
  batch(world, 'Turbine nacelles', boxGeometry(), mat, nacelles, {chunk: 700});
  world.sceneryStats.triangles += rotors.length * ((rotorGeometry.index.count + hubGeometry.index.count) / 3);
  world.sceneryStats.batches += rotors.length * 2;
}

function buildLamps(world) {
  const posts = [], arms = [], housings = [], lights = [];
  for (let s = 22; s < world.track.length; s += 76) {
    if (world.track.inTunnel(s)) continue;
    const q = world.track.sample(s), heading = q.heading;
    const at = (d, h) => world.track.point(s, d, h);
    posts.push({p: at(12, 4.4), x: .14, y: 8.8, z: .14});
    arms.push({p: at(10.96, 8.77), x: 2.2, y: .11, z: .13, ry: heading});
    housings.push({p: at(9.84, 8.74), x: .9, y: .15, z: .41, ry: heading});
    lights.push({p: at(9.79, 8.652), x: .71, y: .025, z: .27, ry: heading});
  }
  batch(world, 'Tapered roadside light poles', new THREE.CylinderGeometry(.58, 1, 1, 6), standard('#798680', .47, .65), posts, {chunk: 0});
  batch(world, 'Streetlight outreach arms', boxGeometry(), standard('#89968e', .45, .62), arms, {chunk: 0});
  batch(world, 'Streetlight housings', boxGeometry(), standard('#485852', .5, .42), housings, {chunk: 0});
  world.lampMaterial = new THREE.MeshStandardMaterial({color: '#e3dac1', emissive: '#ffd39a', emissiveIntensity: 1.3, roughness: .4, toneMapped: false});
  batch(world, 'Warm streetlight lenses', boxGeometry(), world.lampMaterial, lights, {shadow: false, chunk: 0});
}

/** Replace GameWorld.buildScenery with this call after terrain construction. */
export function buildCoastalScenery(world) {
  world.sceneryStats = {triangles: 0, instances: 0, batches: 0, trees: 0, grassClumps: 0, buildings: 0};
  const place = placementTools(world);
  buildVegetation(world, place);
  buildCity(world, place);
  buildPort(world, place);
  buildTurbines(world, place);
  buildLamps(world);
  return world.sceneryStats;
}
