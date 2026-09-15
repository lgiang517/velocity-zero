import {buildRoadsideBuildings} from './roadside-buildings.js';
import * as THREE from 'three';
import {coniferGeometry,coniferWoodGeometry,broadleafCanopyGeometry,broadleafWoodGeometry,canopyMaterial,barkMaterial} from './vegetation-trees.js';

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

function grassGeometry() {
  const builder = geometryBuilder();
  for (let i = 0; i < 6; i++) {
    const angle = i * 2.4, x = Math.cos(angle) * .17, z = Math.sin(angle) * .17;
    const h = .16 + random(i + 7) * .22, w = .008 + random(i + 12) * .007;
    const leanX = Math.cos(angle) * .13, leanZ = Math.sin(angle) * .13;
    builder.hull([[x - w, 0, z], [x + w, 0, z], [x + leanX * .4 + w * .4, h * .58, z + leanZ * .4], [x + leanX, h, z + leanZ]], [[0, 1, 2], [0, 2, 3]], (p, j) => j < 2 ? [.085, .13, .039] : [.25 + i % 2 * .05, .31, .085]);
  }
  return builder.finish();
}

function foliageMaterial(world) {
  const mat=standard('#ffffff',.95);mat.vertexColors=true;mat.envMapIntensity=.12;
  mat.userData.distanceFade={value:new THREE.Vector2(125,175)};
  {
    mat.side = THREE.DoubleSide;
    mat.onBeforeCompile = shader => {
      shader.uniforms.coastTime = world.uniforms.time;
      shader.uniforms.coastFadeRange = mat.userData.distanceFade;
      shader.vertexShader = 'uniform float coastTime;uniform vec2 coastFadeRange;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float phase = 0.;
        #ifdef USE_INSTANCING
          phase = instanceMatrix[3].x * .15 + instanceMatrix[3].z * .11;
          vec3 coastOrigin=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
          transformed*=1.-smoothstep(coastFadeRange.x,coastFadeRange.y,distance(cameraPosition.xz,coastOrigin.xz));
        #endif
        transformed.x += sin(coastTime * 1.65 + phase) * .08 * transformed.y * transformed.y;
        transformed.z += cos(coastTime * 1.13 + phase) * .045 * transformed.y * transformed.y;`);
    };
    mat.customProgramCacheKey = () => 'coastal-grass-distance-sway-v2';
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
  const mat = standard(container ? '#dad4c8' : '#ffffff', container ? .78 : .71, container ? .22 : .12);
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
    if (world.roadsideSites?.some(site=>Math.hypot(site.p.x-p.x,site.p.z-p.z)<site.radius+radius+1))return null;
    if (near.fraction > .896 && near.fraction < .997) return null;
    if (vegetation && near.fraction > .213 && near.fraction < .268) return null;
    p.y = world.groundHeight(p.x, p.z);
    if (!Number.isFinite(p.y) || p.y < -1.5) return null;
    return p;
  }
  return {land};
}

function buildVegetation(world, place) {
  const track = world.track, pines = [], broadleaves = [], grass = [], rocks = [];
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
  }
  for (let i = 0; i < 280 && broadleaves.length < 65; i++) {
    const t = i % 3 ? random(i * 1.32 + 7) * .18 : .49 + random(i + 88) * .14;
    const h = 4.7 + random(i + 711) * 5.1, side = i % 5 ? 1 : -1;
    const p = place.land(t * track.length, side * (25 + random(i + 71) * 48), h * .44, {vegetation: true});
    if (!p) continue;
    broadleaves.push({p, x: h, y: h, z: h * .9, ry: random(i + 451) * TAU, color: ['#d1d7bf', '#c9d5b9', '#e0e3cc', '#ced6bc'][i % 4]});
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
  const firMaterial = canopyMaterial(world,'pine');
  const firBatches = batch(world, 'Continuous coastal fir crowns', coniferGeometry(), firMaterial, pines, {trackItems: true});
  const leafMaterial = canopyMaterial(world,'broadleaf');
  const leafBatches = batch(world, 'Wind-shaped broadleaf crowns', broadleafCanopyGeometry(), leafMaterial, broadleaves, {trackItems: true});
  installVegetationLod(world, {pines, broadleaves, grass, firBatches, leafBatches, firMaterial, leafMaterial});
  const bark=barkMaterial(world);
  batch(world,'Conifer trunk and branch structure',coniferWoodGeometry(),bark,pines);
  batch(world,'Broadleaf trunk and branch structure',broadleafWoodGeometry(),bark,broadleaves);
  batch(world, 'Fractured coastal boulders', rockGeometry(), stoneMaterial(), rocks);
  world.sceneryStats.trees = pines.length + broadleaves.length;
  world.sceneryStats.grassClumps = grass.length;
}

// Sources stay packed on the CPU; only pools whose membership changed upload.
// The low crowns remain in their spatial batches and continue casting shadows
// wherever a nearby tree leaves the detailed pool.
function installVegetationLod(world, {pines, broadleaves, grass, firBatches, leafBatches, firMaterial, leafMaterial}) {
  const triangles = geometry => (geometry.index?.count ?? geometry.attributes.position.count) / 3;
  const pack = items => {
    const matrices = new Float32Array(items.length * 16), colors = new Float32Array(items.length * 3);
    const transform = new THREE.Object3D(), color = new THREE.Color();
    items.forEach((item, i) => {
      transform.position.copy(item.p);transform.rotation.set(item.rx || 0, item.ry || 0, item.rz || 0, 'YXZ');
      transform.scale.set(item.x ?? 1, item.y ?? 1, item.z ?? 1);transform.updateMatrix();
      transform.matrix.toArray(matrices, i * 16);color.set(item.color || '#ffffff').toArray(colors, i * 3);
    });
    return {items, matrices, colors};
  };
  const firSource = pack(pines), leafSource = pack(broadleaves), grassSource = pack(grass);
  function pool(name, geometry, material, source, limit, shadow) {
    const mesh = new THREE.InstancedMesh(geometry, material, limit);
    mesh.name = name;mesh.count = 0;mesh.visible = false;mesh.castShadow = shadow;mesh.receiveShadow = false;
    if(material.userData.foliageDepth)mesh.customDepthMaterial=material.userData.foliageDepth;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(limit * 3), 3).setUsage(THREE.DynamicDrawUsage);
    world.scene.add(mesh);world.sceneryStats.batches++;
    return {mesh, source, limit, selected: [], signature: ''};
  }
  const fir = pool('Nearby fir bough clusters', coniferGeometry(true), firMaterial, firSource, 20, true);
  const leaf = pool('Nearby broadleaf clusters', broadleafCanopyGeometry(true), leafMaterial, leafSource, 12, true);
  const tussocks = pool('Nearby dune and shoulder tussocks', grassGeometry(), foliageMaterial(world, true), grassSource, 240, false);
  const stats = world.sceneryStats;
  stats.triangles += (triangles(fir.mesh.geometry) - triangles(firBatches[0].geometry)) * fir.limit;
  stats.triangles += (triangles(leaf.mesh.geometry) - triangles(leafBatches[0].geometry)) * leaf.limit;
  stats.triangles += triangles(tussocks.mesh.geometry) * tussocks.limit;
  stats.instances += grass.length;
  stats.nearFirLimit = fir.limit;stats.nearBroadleafLimit = leaf.limit;
  stats.needleLimit = 0;stats.grassLimit = tussocks.limit;stats.lodUploads = 0;
  function staticSources(meshes, source) {
    const indices = new Map(source.items.map((item, index) => [item, index]));
    return meshes.map(mesh => ({mesh, ids: mesh.userData.sourceItems.map(item => indices.get(item)), signature: ''}));
  }
  const staticFirs = staticSources(firBatches, firSource), staticLeaves = staticSources(leafBatches, leafSource);
  function writePool(target, selected) {
    // Stable source order avoids uploading just because two distances swapped.
    selected.sort((a, b) => a - b);
    const signature = selected.join(',');
    if (signature === target.signature) return false;
    target.signature = signature;target.selected = selected;
    const {mesh, source} = target;
    selected.forEach((id, slot) => {
      mesh.instanceMatrix.array.set(source.matrices.subarray(id * 16, id * 16 + 16), slot * 16);
      mesh.instanceColor.array.set(source.colors.subarray(id * 3, id * 3 + 3), slot * 3);
    });
    mesh.count = selected.length;mesh.visible = mesh.count > 0;
    if (mesh.count) { mesh.instanceMatrix.needsUpdate = true;mesh.instanceColor.needsUpdate = true;mesh.computeBoundingSphere();stats.lodUploads++; }
    return true;
  }
  function excludeNear(batches, source, selected) {
    const excluded = new Set(selected);
    for (const group of batches) {
      const signature = group.ids.filter(id => excluded.has(id)).join(',');
      if (signature === group.signature) continue;
      group.signature = signature;let count = 0;
      for (const id of group.ids) if (!excluded.has(id)) {
        group.mesh.instanceMatrix.array.set(source.matrices.subarray(id * 16, id * 16 + 16), count * 16);
        group.mesh.instanceColor.array.set(source.colors.subarray(id * 3, id * 3 + 3), count * 3);count++;
      }
      group.mesh.count = count;
      group.mesh.instanceMatrix.needsUpdate = true;group.mesh.instanceColor.needsUpdate = true;stats.lodUploads++;
      // The original full-grove bounds remain conservative after compaction.
    }
  }
  const position = new THREE.Vector3(), direction = new THREE.Vector3(), lastPosition = new THREE.Vector3(Infinity, Infinity, Infinity), lastDirection = new THREE.Vector3();
  const frustum = new THREE.Frustum(), projection = new THREE.Matrix4(), sphere = new THREE.Sphere();
  let lastQuality;const lastProjection = new THREE.Matrix4();
  function select(source, radius, limit) {
    const candidates = [];
    source.items.forEach((item, id) => {
      const dx = item.p.x - position.x, dz = item.p.z - position.z, distance = dx * dx + dz * dz;
      if (distance > radius * radius) return;
      sphere.center.copy(item.p);sphere.center.y += (item.y || 1) * .5;
      sphere.radius = (item.y || 1) * .7 + 12;
      if (frustum.intersectsSphere(sphere)) candidates.push({id, distance});
    });
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates.slice(0, limit).map(candidate => candidate.id);
  }
  world.updateVegetationLod = (camera = world.camera) => {
    if (!camera) return;
    camera.updateMatrixWorld();camera.getWorldPosition(position);camera.getWorldDirection(direction);
    const quality = world.quality || 'balanced';
    if (position.distanceToSquared(lastPosition) < 16 && direction.dot(lastDirection) > .9995 && quality === lastQuality && camera.projectionMatrix.equals(lastProjection)) return;
    lastPosition.copy(position);lastDirection.copy(direction);lastQuality = quality;lastProjection.copy(camera.projectionMatrix);
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);
    const low = quality === 'low', high = quality === 'high';
    const grassRange = tussocks.mesh.material.userData.distanceFade.value;
    grassRange.set(low ? 65 : high ? 125 : 95, low ? 110 : high ? 200 : 160);
    if (writePool(fir, select(firSource, low ? 145 : high ? 220 : 190, low ? 12 : fir.limit))) excludeNear(staticFirs, firSource, fir.selected);
    if (writePool(leaf, select(leafSource, low ? 150 : high ? 240 : 210, low ? 6 : leaf.limit))) excludeNear(staticLeaves, leafSource, leaf.selected);
    writePool(tussocks, select(grassSource, grassRange.y + 5, low ? 140 : tussocks.limit));
    stats.nearFirs = fir.mesh.count;stats.nearBroadleaves = leaf.mesh.count;
    stats.needleTrees = 0;stats.visibleGrassClumps = tussocks.mesh.count;
  };
  // World.update runs this before the shadow pass. Keep standalone renderers
  // correct too; unchanged camera position, direction and quality return early.
  const prior = world.scene.onBeforeRender;
  world.scene.onBeforeRender = function(renderer, scene, camera, ...rest) {
    prior.call(this, renderer, scene, camera, ...rest);
    world.updateVegetationLod(world.camera || camera);
  };
}

function buildCity(world, place) {
  const bodies = [], stone = [], dark = [], trim = [], glass = [];
  const footprint = [];
  const facadeColors = ['#c0c1ac', '#909c94', '#d0c8b3', '#a3aea4', '#7d9390'];
  // A mix of waterfront mid-rise and a smaller inland tower cluster gives the
  // city a legible skyline; real roof volumes catch the low evening sunlight.
  for (let i = 0; i < 170 && bodies.length < 28; i++) {
    const t = .482 + random(i * 2.72 + 11) * .19, s = t * world.track.length;
    const side = i % 4 === 0 ? -1 : 1;
    const width = 12 + random(i + 19) * 15, depth = 14 + random(i + 197) * 17;
    const lateral = side * (105 + random(i + 182) * 110), radius = Math.hypot(width, depth) * .52;
    const p = place.land(s, lateral, radius);
    if (!p || footprint.some(q => q.p.distanceToSquared(p) < (q.radius + radius + 4) ** 2)) continue;
    const heading = world.track.sample(s).heading-side*Math.PI/2;
    const cornerHeights=[];
    for(const x of[-width/2-.5,0,width/2+.5])for(const z of[-depth/2-.5,0,depth/2+.5]){const v=new THREE.Vector3(x,0,z).applyAxisAngle(UP,heading).add(p);cornerHeights.push(world.groundHeight(v.x,v.z));}
    if(Math.max(...cornerHeights)-Math.min(...cornerHeights)>4)continue;
    p.y=Math.max(...cornerHeights)+.12;
    const footingHeight=p.y-Math.min(...cornerHeights)+.7;
    stone.push({p:p.clone().add(new THREE.Vector3(0,-footingHeight/2,0)),x:width+1,y:footingHeight,z:depth+1,ry:heading,color:'#777e73'});
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
  buildRoadsideBuildings(world, place);
  buildVegetation(world, place);
  buildCity(world, place);
  buildPort(world, place);
  buildTurbines(world, place);
  buildLamps(world);
  return world.sceneryStats;
}
