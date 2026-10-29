// StudyForge v2.3.1 — The Vault.
// A product-shot display of forged alloys on a polished granite slab: cast ingots with stamped
// hallmarks under studio lighting, and sand-cast moulds where the next alloy is still molten.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { ingotGeometry, mouldGeometry, cavityAt, roundedRectGeometry, MOULD } from './geometry.js';
import { metalFace, sandSurface, graniteSurface, radialTexture } from './textures.js';
import { createStudioEnvironment } from './environment.js';
import { moltenMaterial, createEmbers, createLightBeam } from './effects.js';
import { ContactShadows, Pipeline } from './render.js';

const SF = window.SF;
const L = SF.logic;
const doc = document;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const SPACING = 2.45;
const SLAB_TOP = 0.34;
const SLAB_DEPTH = 2.7;
const COUNT = 5;
const itemX = (i) => (i - (COUNT - 1) / 2) * SPACING;

// Physically-based recipes. Colours are the metals' real reflectance, in sRGB.
const METALS = {
  bronze: { color: '#c9824f', roughness: 0.3, mark: 'CU · SN', fine: 'BRONZE', grade: 'CAST ALLOY' },
  silver: { color: '#efeeec', roughness: 0.16, mark: 'AG 999', fine: 'SILVER', grade: 'FINE 999', brushed: true, anisotropy: 0.55 },
  gold: { color: '#ffc45c', roughness: 0.14, mark: 'AU 999.9', fine: 'GOLD', grade: 'FINE 999.9' },
  platinum: { color: '#d8d3cb', roughness: 0.12, mark: 'PT 950', fine: 'PLATINUM', grade: 'PURE 950', clearcoat: 0.8 },
  mythril: { color: '#b4f2e4', roughness: 0.15, mark: 'MI ∞', fine: 'MYTHRIL', grade: 'TRUE MYTHRIL', iridescence: 1 }
};

// ---------- State ----------
const V = {
  els: null, ready: false, visible: false, onScreen: true, running: false,
  state: null, status: null, key: '', selected: 0, hovered: -1, inspect: false,
  time: 0, lastInput: 0, frame: 0, quality: 'high', samples: [], shadowsDirty: true
};
let renderer, scene, camera, pipeline, shadows, rig, beam, raycaster;
const pointer = new THREE.Vector2(0, 0);
const parallax = new THREE.Vector2(0, 0);
const slots = [];
let molten = null;
let camX = 0, camXTarget = 0, drag = null;
const spin = { yaw: 0, pitch: 0, vyaw: 0 };
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
const camOff = new THREE.Vector3(), lookOff = new THREE.Vector3(), lookNow = new THREE.Vector3();
const clock = new THREE.Clock(false);
const textureCache = new Map();

// ---------- Scene ----------
function buildScene(stage) {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  // Khronos PBR Neutral: built for product renders, keeps metal and molten colours true.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x0b0b0d, 1);
  const canvas = renderer.domElement;
  canvas.className = 'vault-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  stage.insertBefore(canvas, stage.firstChild);

  RectAreaLightUniformsLib.init();

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0b0d);
  scene.fog = new THREE.Fog(0x0b0b0d, 9, 17);
  scene.environment = createStudioEnvironment(renderer);
  scene.environmentIntensity = 1.0;

  camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 60);

  // Backdrop: a soft pool of light on the far wall, like a photo studio sweep.
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 14),
    new THREE.MeshBasicMaterial({
      map: radialTexture([[0, '#2a241f'], [0.45, '#15130f'], [1, '#0b0b0d']]),
      fog: false
    })
  );
  backdrop.position.set(0, 3, -6.5);
  scene.add(backdrop);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 30).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x0c0b0b, roughness: 0.92, metalness: 0 })
  );
  scene.add(floor);

  // The display slab: polished black granite with a thin brass inlay along the front.
  const slabLen = SPACING * COUNT + 1.6;
  const granite = graniteSurface({});
  const slab = new THREE.Mesh(
    new RoundedBoxGeometry(slabLen, SLAB_TOP, SLAB_DEPTH, 4, 0.025),
    new THREE.MeshPhysicalMaterial({
      map: granite.map, roughnessMap: granite.roughnessMap, roughness: 1, metalness: 0,
      specularIntensity: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.16
    })
  );
  slab.position.y = SLAB_TOP / 2;
  scene.add(slab);
  const inlay = new THREE.Mesh(
    new THREE.BoxGeometry(slabLen - 0.2, 0.006, 0.018),
    new THREE.MeshPhysicalMaterial({ color: '#c99b5b', metalness: 1, roughness: 0.25 })
  );
  inlay.position.set(0, SLAB_TOP + 0.002, SLAB_DEPTH / 2 - 0.12);
  scene.add(inlay);

  // Studio rig that travels with the camera: area lights + a faint beam over the hero.
  rig = new THREE.Group();
  scene.add(rig);
  const area = (color, intensity, w, h, p, look) => {
    const l = new THREE.RectAreaLight(color, intensity, w, h);
    l.position.set(p[0], p[1], p[2]);
    l.lookAt(look[0], look[1], look[2]);
    rig.add(l);
  };
  area(0xfff4e8, 4.5, 5, 1.2, [0, 4.4, 2.0], [0, SLAB_TOP, 0]);    // overhead key
  area(0xfff0e0, 4.5, 0.5, 3.5, [-3.6, 1.9, 2.6], [0, 0.5, 0]);   // left strip
  area(0xe3ecff, 3.5, 0.5, 3.5, [3.6, 1.9, 2.4], [0, 0.5, 0]);    // right strip (cool)
  area(0xffffff, 5, 6, 0.35, [0, 2.4, -2.8], [0, 0.45, 0]);       // rim from behind
  area(0xff9a5a, 0.5, 3, 0.4, [0, 0.12, 2.5], [0, 0.4, 0]);       // faint warm bounce off the slab
  beam = createLightBeam();
  beam.position.y = SLAB_TOP;
  rig.add(beam);

  for (let i = 0; i < COUNT; i++) {
    const g = new THREE.Group();
    g.position.set(itemX(i), SLAB_TOP, 0);
    scene.add(g);
    slots.push({ group: g, item: null, kind: null, lift: 0, hover: 0, label: null, mats: [] });
  }

  shadows = new ContactShadows(renderer, { width: slabLen, depth: SLAB_DEPTH - 0.2, y: SLAB_TOP, blur: 3.4, opacity: 0.92 });
  scene.add(shadows.mesh);

  pipeline = new Pipeline(renderer, scene, camera);
  raycaster = new THREE.Raycaster();
}

// ---------- Ingots ----------
function displayName(state) {
  const name = (state.settings.smithName || '').trim();
  if (name) return name;
  const t = L.TITLES.find((x) => x.id === state.equippedTitle);
  return t ? t.name : 'A Smith';
}

const fmtStamp = (ts) => (ts ? new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() : '');

function faceTextures(key, opts) {
  if (!textureCache.has(key)) textureCache.set(key, metalFace(opts));
  return textureCache.get(key);
}

function makeIngot(i, state, journey) {
  const alloy = L.ALLOYS[i];
  const m = METALS[alloy.id];
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const base = {
    color: new THREE.Color(m.color), metalness: 1, roughness: 1, envMapIntensity: 1.0,
    clearcoat: m.clearcoat || 0, clearcoatRoughness: 0.08,
    anisotropy: m.anisotropy || 0, anisotropyRotation: 0
  };
  if (m.iridescence) Object.assign(base, { iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [240, 820] });

  const face = (name, opts) => {
    const t = faceTextures(alloy.id + ':' + name + ':' + (opts.lines ? JSON.stringify(opts.lines) : ''),
      Object.assign({ roughness: m.roughness, brushed: !!m.brushed, anisotropy: aniso, seed: (i + 1) * 97 + name.length * 13 }, opts));
    return new THREE.MeshPhysicalMaterial(Object.assign({}, base, {
      map: t.map, roughnessMap: t.roughnessMap, normalMap: t.normalMap,
      normalScale: new THREE.Vector2(0.9, 0.9)
    }));
  };

  const plain = face('plain', { w: 512, h: 256 });
  const top = face('top', {
    w: 1024, h: 512,
    lines: [
      { text: 'STUDYFORGE', size: 40, spacing: 16, weight: 600 },
      { text: m.fine, size: 128, spacing: 22, weight: 700, lead: 1.15 },
      { text: m.grade, size: 42, spacing: 12, weight: 600 }
    ]
  });
  const front = face('front', { w: 1024, h: 256, lines: [{ text: m.mark, size: 132, spacing: 18, weight: 700 }] });
  const back = face('back', {
    w: 1024, h: 256,
    lines: [
      { text: 'FORGED BY', size: 34, spacing: 12, weight: 600 },
      { text: displayName(state).toUpperCase(), size: 74, spacing: 10, weight: 700, lead: 1.1 },
      { text: fmtStamp(journey.forgedAt), size: 34, spacing: 10, weight: 600 }
    ]
  });
  // RoundedBoxGeometry groups: +x, -x, +y (top), -y, +z (front), -z (back).
  const mats = [plain, plain, top, plain, front, back];
  const mesh = new THREE.Mesh(ingotGeometry(), mats);
  mesh.userData.mats = [plain, top, front, back];
  return mesh;
}

// ---------- Moulds ----------
let mouldGeo = null, sand = null;

function makeMould(i, fill, isNext) {
  if (!mouldGeo) mouldGeo = mouldGeometry();
  if (!sand) sand = sandSurface({});
  const g = new THREE.Group();
  // Graphite casting mould, as used for real bullion: dark, fine-grained, with a soft sheen.
  const mat = new THREE.MeshPhysicalMaterial({
    map: sand.map, normalMap: sand.normalMap, normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.62, metalness: 0.15, color: isNext ? 0x9a9a9e : 0x7a7a7e,
    sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x9a9aa0)
  });
  const mould = new THREE.Mesh(mouldGeo, mat);
  g.add(mould);
  g.userData.mould = mould;

  if (isNext && fill > 0.004) {
    const c = cavityAt(fill);
    const metal = METALS[L.ALLOYS[i].id];
    const surface = new THREE.Mesh(roundedRectGeometry(c.width, c.depth, 0.05), moltenMaterial(metal.color));
    surface.position.y = c.level;
    g.add(surface);
    const glow = new THREE.PointLight(0xff6a1a, 1.2 + fill * 1.2, 1.4, 2);
    glow.position.y = c.level + 0.12;
    g.add(glow);
    const embers = createEmbers(90, new THREE.Vector3(c.width * 0.9, 1.8, c.depth * 0.8));
    embers.position.y = c.level;
    g.add(embers);
    molten = { slot: i, surface, glow, embers, mould: mat, fill, level: c.level, width: c.width };
  }
  return g;
}

function dispose(obj) {
  obj.traverse((o) => {
    if (o.geometry && o.geometry !== mouldGeo) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    mats.forEach((m) => m.dispose());
  });
}

// ---------- Data ----------
function computeStatus(state) {
  const alloyIdx = L.alloyIndex(L.achievementStats(state));
  const journey = L.alloyJourney(state);
  return L.ALLOYS.map((a, i) => {
    const kind = i <= alloyIdx ? 'forged' : i === alloyIdx + 1 ? 'next' : 'locked';
    return { kind, journey: journey[i], fill: kind === 'next' ? L.mouldFill(state, i) : 0 };
  });
}

function rebuild(state) {
  V.status = computeStatus(state);
  const key = JSON.stringify([V.status.map((s) => [s.kind, s.journey.forgedAt || 0, s.fill.toFixed(3)]), displayName(state)]);
  if (key === V.key) return false;
  V.key = key;
  molten = null;
  slots.forEach((slot, i) => {
    if (slot.item) { slot.group.remove(slot.item); dispose(slot.item); }
    const s = V.status[i];
    slot.kind = s.kind;
    slot.item = s.kind === 'forged' ? makeIngot(i, state, s.journey) : makeMould(i, s.fill, s.kind === 'next');
    slot.item.traverse((o) => { o.userData.slot = i; });
    slot.group.add(slot.item);
  });
  V.shadowsDirty = true;
  return true;
}

// ---------- Camera & selection ----------
function setCameraTargets() {
  const x = itemX(V.selected);
  camXTarget = x;
  if (V.inspect) {
    camPos.set(0, 1.45, 2.7);
    camLook.set(0, SLAB_TOP + 0.48, 0);
  } else {
    camPos.set(0, 1.95, 4.7);
    camLook.set(0, SLAB_TOP + 0.12, 0);
  }
}

function select(i, opts = {}) {
  V.selected = Math.max(0, Math.min(COUNT - 1, i));
  if (opts.inspect != null) V.inspect = !!opts.inspect && V.status[V.selected].kind !== 'locked';
  spin.yaw = 0; spin.pitch = 0; spin.vyaw = 0;
  setCameraTargets();
  V.els.vault.classList.toggle('inspecting', V.inspect);
  V.els.exit.hidden = !V.inspect;
  if (reducedMotion) { camX = camXTarget; }
  renderPanel();
  updateLabels(true);
  wake();
}

// ---------- Input ----------
function toNdc(e) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
}

function pick() {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(slots.map((s) => s.group), true);
  for (const h of hits) if (h.object.userData.slot != null && h.object.isMesh) return h.object.userData.slot;
  return -1;
}

function onDown(e) {
  if (e.button !== 0) return;
  renderer.domElement.setPointerCapture(e.pointerId);
  toNdc(e);
  drag = { x: e.clientX, y: e.clientY, cam: camX, yaw: spin.yaw, pitch: spin.pitch, moved: 0, lastX: e.clientX, lastT: performance.now(), v: 0 };
  wake();
}

function onMove(e) {
  toNdc(e);
  V.lastInput = performance.now();
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
    const now = performance.now();
    const v = (e.clientX - drag.lastX) / Math.max(1, now - drag.lastT);
    drag.v = drag.v * 0.6 + v * 0.4;
    drag.lastX = e.clientX; drag.lastT = now;
    if (V.inspect) {
      spin.yaw = drag.yaw + dx * 0.011;
      spin.pitch = Math.max(-0.6, Math.min(0.85, drag.pitch + dy * 0.007));
    } else {
      const w = renderer.domElement.clientWidth;
      camX = drag.cam - (dx / w) * SPACING * 2.2;
      camXTarget = camX;
    }
  } else {
    const h = pick();
    if (h !== V.hovered) {
      V.hovered = h;
      renderer.domElement.style.cursor = h >= 0 ? 'pointer' : '';
    }
  }
  wake();
}

function onUp(e) {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.moved < 6) {
    toNdc(e);
    const i = pick();
    if (i >= 0) select(i, { inspect: i === V.selected ? !V.inspect : false });
    else if (V.inspect) select(V.selected, { inspect: false });
    return;
  }
  if (V.inspect) {
    spin.vyaw = d.v * 0.25;
  } else {
    const w = renderer.domElement.clientWidth;
    const projected = camX - (d.v * 260 / w) * SPACING;
    select(Math.round(projected / SPACING + (COUNT - 1) / 2));
  }
}

function onLeave() {
  if (V.hovered !== -1) V.hovered = -1;
  pointer.set(0, 0);
  wake();
}

// ---------- Loop ----------
let settle = 0;
function wake() {
  settle = 120;
  V.lastInput = performance.now();
  updateRunning();
}

function shouldRun() {
  return V.ready && V.visible && V.onScreen && !doc.hidden;
}

function updateRunning() {
  if (!renderer) return;
  const run = shouldRun();
  if (run === V.running) return;
  V.running = run;
  if (run) { clock.start(); clock.getDelta(); }
  renderer.setAnimationLoop(run ? frame : null);
}

function adaptQuality(ms) {
  if (V.forcedQuality) return;
  V.frame++;
  if (V.frame < 45) return;
  V.samples.push(ms);
  if (V.samples.length < 60) return;
  const avg = V.samples.reduce((a, b) => a + b, 0) / V.samples.length;
  V.samples.length = 0;
  const next = avg > 26 ? (V.quality === 'high' ? 'medium' : V.quality === 'medium' ? 'low' : null) : null;
  if (next) {
    V.quality = next;
    resize();
  }
}

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const idle = performance.now() - V.lastInput > 2500 && !drag;
  // When nothing is being touched, draw at half rate: the lava still moves, the fan stays quiet.
  V.tick = (V.tick || 0) + 1;
  if (idle && !reducedMotion && (V.tick & 1)) return;
  const t0 = performance.now();
  if (!reducedMotion) V.time += idle ? dt * 2 : dt;
  const k = reducedMotion ? 1 : 1 - Math.pow(0.002, dt);

  if (!V._camInit) {
    V._camInit = true;
    camX = camXTarget;
    camOff.copy(camPos);
    lookOff.copy(camLook);
    rig.position.x = camXTarget;
  }
  if (!drag) camX += (camXTarget - camX) * k;
  camOff.lerp(camPos, k);
  lookOff.lerp(camLook, k);
  parallax.lerp(pointer, reducedMotion ? 1 : 0.06);
  camera.position.set(camX + camOff.x + parallax.x * 0.12, camOff.y + parallax.y * 0.06, camOff.z);
  lookNow.set(camX + lookOff.x, lookOff.y, lookOff.z);
  camera.lookAt(lookNow);
  rig.position.x += (camX - rig.position.x) * k;

  // Items: hover lift, inspect lift and turning.
  let shadowsMoving = false;
  slots.forEach((slot, i) => {
    if (!slot.item) return;
    const sel = i === V.selected;
    const forged = slot.kind === 'forged';
    const wantLift = (sel && V.inspect && forged ? 0.42 : 0) + (i === V.hovered && forged && !V.inspect ? 0.03 : 0);
    const before = slot.lift;
    slot.lift += (wantLift - slot.lift) * k;
    if (Math.abs(slot.lift - before) > 0.0005) shadowsMoving = true;
    slot.item.position.y = slot.lift;
    const wantHover = i === V.hovered ? 1 : 0;
    slot.hover += (wantHover - slot.hover) * k;
    if (slot.item.userData.mats) slot.item.userData.mats.forEach((m) => { m.envMapIntensity = 1 + slot.hover * 0.45; });
    if (sel && V.inspect && forged) {
      if (!drag) { spin.yaw += spin.vyaw; spin.vyaw *= 0.94; }
      slot.item.rotation.y += (spin.yaw - slot.item.rotation.y) * k;
      slot.item.rotation.x += (spin.pitch - slot.item.rotation.x) * k;
    } else {
      slot.item.rotation.y += (0 - slot.item.rotation.y) * k;
      slot.item.rotation.x += (0 - slot.item.rotation.x) * k;
    }
    if (Math.abs(slot.item.rotation.y) > 0.001 || Math.abs(slot.item.rotation.x) > 0.001) shadowsMoving = shadowsMoving || slot.lift > 0.01;
  });

  // Molten metal, embers, beam & dust.
  if (molten) {
    molten.surface.material.uniforms.uTime.value = V.time;
    molten.embers.material.uniforms.uTime.value = V.time;
    molten.embers.material.uniforms.uPixel.value = renderer.getPixelRatio();
    const flick = reducedMotion ? 0 : Math.sin(V.time * 7.1) * 0.35 + Math.sin(V.time * 12.7) * 0.2;
    molten.glow.intensity = 1.2 + molten.fill * 1.2 + flick * 0.5;
  }
  beam.userData.dust.material.uniforms.uTime.value = V.time;
  beam.userData.dust.material.uniforms.uPixel.value = renderer.getPixelRatio();

  // Depth of field focuses on the hero; heat haze sits over the molten metal.
  const hero = new THREE.Vector3(itemX(V.selected), SLAB_TOP + 0.2 + slots[V.selected].lift, 0);
  pipeline.dof.uniforms.focus.value = camera.position.distanceTo(hero);
  pipeline.dof.uniforms.aperture.value = V.inspect ? 0.0026 : 0.0014;
  pipeline.dof.uniforms.maxblur.value = 0.009;
  const haze = pipeline.haze.uniforms;
  haze.uTime.value = V.time;
  if (molten && pipeline.haze.enabled) {
    const c = new THREE.Vector3(itemX(molten.slot), SLAB_TOP + molten.level, 0).project(camera);
    const e = new THREE.Vector3(itemX(molten.slot) + molten.width / 2, SLAB_TOP + molten.level, 0).project(camera);
    haze.uCenter.value.set(c.x * 0.5 + 0.5, c.y * 0.5 + 0.5);
    const halfW = Math.max(0.02, Math.abs(e.x - c.x) * 0.5);
    haze.uSize.value.set(halfW * 1.1, halfW * 1.1 * camera.aspect);
    haze.uStrength.value = Math.abs(c.x) < 1.3 && !reducedMotion ? 1 : 0;
  } else {
    haze.uStrength.value = 0;
  }

  if (V.shadowsDirty || shadowsMoving) {
    shadows.mesh.material.opacity = 0.92;
    shadows.update(scene, slots.map((s) => s.item).filter(Boolean));
    V.shadowsDirty = false;
  }

  pipeline.composer.render(dt);
  updateLabels(false);
  adaptQuality(performance.now() - t0);

  if (settle > 0) settle--;
  if (reducedMotion && settle === 0 && !drag) {
    renderer.setAnimationLoop(null);
    V.running = false;
  }
}

// ---------- Captions (also the keyboard-accessible controls) ----------
const tmp = new THREE.Vector3();
function updateLabels(force) {
  const w = V.els.stage.clientWidth, h = V.els.stage.clientHeight;
  slots.forEach((slot, i) => {
    const b = slot.label;
    tmp.set(itemX(i), SLAB_TOP, SLAB_DEPTH / 2 - 0.22).project(camera);
    const x = (tmp.x * 0.5 + 0.5) * w, y = (-tmp.y * 0.5 + 0.5) * h;
    b.style.transform = `translate(-50%, 0) translate(${x.toFixed(1)}px, ${(y + 10).toFixed(1)}px)`;
    const onScreen = Math.abs(tmp.x) < 1.05;
    b.classList.toggle('sel', i === V.selected);
    b.style.opacity = !onScreen || (V.inspect && i !== V.selected) ? '0' : i === V.selected ? '1' : '0.55';
    b.tabIndex = 0;
  });
  if (!force) return;
  slots.forEach((slot, i) => {
    const s = V.status[i];
    const a = L.ALLOYS[i];
    const sub = s.kind === 'forged' ? 'Forged' : s.kind === 'next' ? `${Math.round(s.fill * 100)}% cast` : 'Locked';
    slot.label.querySelector('.vl-name').textContent = a.name;
    slot.label.querySelector('.vl-sub').textContent = sub;
    slot.label.dataset.kind = s.kind;
    slot.label.setAttribute('aria-label', `${a.name}, ${sub}${i === V.selected ? ', selected' : ''}`);
    slot.label.setAttribute('aria-pressed', String(i === V.selected));
  });
}

function buildLabels() {
  V.els.labels.textContent = '';
  slots.forEach((slot, i) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'vault-label';
    b.dataset.alloy = L.ALLOYS[i].id;
    b.innerHTML = '<span class="vl-dot"></span><span class="vl-name"></span><span class="vl-sub"></span>';
    b.addEventListener('click', () => select(i, { inspect: i === V.selected ? !V.inspect : false }));
    V.els.labels.appendChild(b);
    slot.label = b;
  });
}

// ---------- Side panel ----------
function h(tag, cls, text) {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

const hours = (ms) => {
  const m = Math.round(ms / L.MIN);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};
const longDate = (ts) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

function renderPanel() {
  const state = V.state;
  if (!state || !V.status) return;
  const i = V.selected;
  const a = L.ALLOYS[i];
  const s = V.status[i];
  const m = METALS[a.id];
  const p = V.els.panel;
  p.textContent = '';
  p.dataset.alloy = a.id;

  p.appendChild(h('span', 'vp-eyebrow', `${String(i + 1).padStart(2, '0')} / 05 · ${m.grade}`));
  p.appendChild(h('h3', 'vp-name', a.name));
  p.appendChild(h('span', `vp-status ${s.kind}`,
    s.kind === 'forged' ? (s.journey.forgedAt ? `Forged ${longDate(s.journey.forgedAt)}` : 'Forged')
      : s.kind === 'next' ? `In the mould · ${Math.round(s.fill * 100)}% cast` : 'Locked'));

  const title = L.TITLES.find((t) => t.alloy === i);
  if (s.kind === 'forged') {
    const j = s.journey;
    if (j.forgedAt && i > 0) {
      const grid = h('dl', 'vp-grid');
      [['Days', String(j.days)], ['Sessions', String(j.sessions)], ['Studied', hours(j.studied)],
        ['Subject', j.topSubject || '—'], ['Streak', `${j.bestStreak}d`]].forEach(([k, v]) => {
        const d = h('div');
        d.appendChild(h('dt', null, k));
        d.appendChild(h('dd', null, v));
        grid.appendChild(d);
      });
      p.appendChild(h('p', 'vp-lede', `The road to ${a.name.toLowerCase()}`));
      p.appendChild(grid);
    } else {
      p.appendChild(h('p', 'vp-lede', i === 0 ? 'Every smith begins in bronze.' : 'Forged before your history began.'));
    }
    const hall = h('div', 'vp-hallmark');
    hall.appendChild(h('span', null, 'Hallmark'));
    hall.appendChild(h('q', null, `Forged by ${displayName(state)}`));
    p.appendChild(hall);
    if (title) p.appendChild(h('p', 'vp-perk', `Title unlocked · ${title.name}`));
    const btn = h('button', 'btn vp-inspect', V.inspect ? 'Return to the slab' : 'Inspect up close');
    btn.type = 'button';
    btn.addEventListener('click', () => select(i, { inspect: !V.inspect }));
    p.appendChild(btn);
    if (V.inspect) p.appendChild(h('p', 'vp-note', 'Drag to turn the bar. Your hallmark is stamped on the back.'));
  } else {
    p.appendChild(h('p', 'vp-lede', s.kind === 'next'
      ? `Molten ${a.name.toLowerCase()} is filling the mould. Every Ingot you earn pours more in.`
      : 'An empty mould, waiting for its metal.'));
    const list = h('ul', 'vp-reqs');
    L.alloyRequirements(state, i).forEach((r) => {
      const li = h('li', r.done ? 'done' : '');
      li.appendChild(h('span', 'vp-check', r.done ? '✓' : ''));
      const body = h('div');
      const row = h('div', 'vp-req-row');
      row.appendChild(h('span', 'vp-req-label', r.label));
      row.appendChild(h('span', 'vp-req-val', `${Math.min(r.cur, r.goal)} / ${r.goal}`));
      body.appendChild(row);
      const bar = h('div', 'vp-bar');
      const fill = h('div', 'vp-bar-fill');
      fill.style.width = `${r.frac * 100}%`;
      bar.appendChild(fill);
      body.appendChild(bar);
      li.appendChild(body);
      list.appendChild(li);
    });
    p.appendChild(list);
    if (title) p.appendChild(h('p', 'vp-perk', `Unlocks the title · ${title.name}`));
  }

  const nav = h('div', 'vp-nav');
  const prev = h('button', 'vp-arrow', '←');
  const next = h('button', 'vp-arrow', '→');
  prev.type = next.type = 'button';
  prev.setAttribute('aria-label', 'Previous alloy');
  next.setAttribute('aria-label', 'Next alloy');
  prev.disabled = i === 0;
  next.disabled = i === COUNT - 1;
  prev.addEventListener('click', () => select(i - 1, { inspect: false }));
  next.addEventListener('click', () => select(i + 1, { inspect: false }));
  const dots = h('div', 'vp-dots');
  for (let d = 0; d < COUNT; d++) dots.appendChild(h('span', d === i ? 'on' : ''));
  nav.appendChild(prev);
  nav.appendChild(dots);
  nav.appendChild(next);
  p.appendChild(nav);
}

// ---------- Size & visibility ----------
function resize() {
  if (!renderer) return;
  const w = V.els.stage.clientWidth, hgt = V.els.stage.clientHeight;
  if (!w || !hgt) return;
  camera.aspect = w / hgt;
  camera.fov = camera.aspect < 1.3 ? 40 : 30;
  camera.updateProjectionMatrix();
  pipeline.setQuality(V.quality, w, hgt);
  V.shadowsDirty = true;
  wake();
}

function observeVisibility() {
  // Pause the GPU work when the stage is scrolled away (content-visibility, IO fallback).
  if ('contentVisibility' in doc.documentElement.style) {
    V.els.stage.addEventListener('contentvisibilityautostatechange', (e) => {
      V.onScreen = !e.skipped;
      updateRunning();
    });
  } else if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      V.onScreen = entries[0].isIntersecting;
      updateRunning();
    }, { rootMargin: '200px' }).observe(V.els.stage);
  }
  doc.addEventListener('visibilitychange', updateRunning);
}

// ---------- Public API (used by js/vault.js) ----------
function mount(els) {
  V.els = els;
  const q = new URLSearchParams(location.search).get('vaultQuality');
  if (q && ['high', 'medium', 'low'].includes(q)) { V.quality = q; V.forcedQuality = true; }
  buildScene(els.stage);
  buildLabels();
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('pointerleave', onLeave);
  els.exit.addEventListener('click', () => select(V.selected, { inspect: false }));
  els.stage.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); select(V.selected - 1, { inspect: false }); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); select(V.selected + 1, { inspect: false }); }
    else if (e.key === 'Enter' && e.target === els.stage && V.status[V.selected].kind !== 'locked') { e.preventDefault(); select(V.selected, { inspect: !V.inspect }); }
    else if (e.key === 'Escape' && V.inspect) { e.preventDefault(); e.stopPropagation(); select(V.selected, { inspect: false }); }
  });
  new ResizeObserver(resize).observe(els.stage);
  observeVisibility();
  V.ready = true;
  els.vault.classList.add('ready');
  els.loading.hidden = true;
  if (V.state) update(V.state, true);
  resize();
}

function update(state, first) {
  V.state = state;
  if (!V.ready) return;
  const changed = rebuild(state);
  if (first || (changed && V.firstDone !== true)) {
    let cur = 0;
    V.status.forEach((s, i) => { if (s.kind === 'forged') cur = i; });
    V.selected = cur;
    V.firstDone = true;
  }
  setCameraTargets();
  renderPanel();
  updateLabels(true);
  wake();
}

function setVisible(on) {
  V.visible = on;
  if (!on && V.inspect && V.ready) select(V.selected, { inspect: false });
  updateRunning();
}

SF.vault3d = { mount, update, setVisible, debug: () => ({ quality: V.quality, selected: V.selected, running: V.running }) };
