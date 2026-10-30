// StudyForge v2.4 — the live forge behind the session timer.
// A fixed, cinematic shot of a smithy: coals that glow with your heat, a billet on the anvil
// that heats through real blackbody colours, a hammer strike for every Ingot, cracks when
// distracted, a banked-down forge on breaks, and a cold single-spotlight look for exams.
// Not interactive by design: it's a living backdrop, not something to play with.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { HeatHazeShader } from '../vault/effects.js';
import { softboxTexture } from '../vault/textures.js';
import { brickSurface, woodSurface, floorSurface, billetSurface } from './textures.js';
import { ingotGeometry } from '../vault/geometry.js';

const SF = window.SF;
const L = SF.logic;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FPS = 30;

// Wide composition: hearth in the left third, anvil in the right third, the timer
// floating over the dark wall between them.
const ANVIL_POS = new THREE.Vector3(2.15, 0.66, 0.35);
const HEARTH_POS = new THREE.Vector3(-2.75, 0, -1.3);
const COAL_TOP = 0.92;

const F = {
  mounted: false, active: false, calm: false, running: false, dirty: true,
  snap: null, time: 0, acc: 0, lastIngots: null, cracks: -1,
  // Smoothed visual state, eased toward targets every frame.
  temp: 20, coal: 0.15, exam: 0, rest: 0, legend: 0, quality: 1, slowFrames: 0, fade: 0.1
};
let renderer, scene, camera, composer, bloom, haze, clock;
let coals, flames, embers, sparks, steam, billet, billetMat, billetLight, hearthLight, examSpot, hammer, anvilTop, windowLight, hemi;
const strike = { t: -1, impactDone: false };
const tmpV = new THREE.Vector3();
const BARREL_POS = new THREE.Vector3(3.4, 0, -0.8);
// Finale state: the timeline, the finished ingot, steam and shattered chunks.
const FIN = { tl: null, ingot: null, steam: null, chunks: [], spot: null, fill: null, lift: { v: 0 }, active: false, quenched: false };
const FIN_METALS = {
  bronze: 0xc9824f, silver: 0xe8e8ea, gold: 0xffc45c, platinum: 0xd8d3cb, mythril: 0xb4f2e4
};
const cam = { base: new THREE.Vector3(0, 2.15, 6.6), look: new THREE.Vector3(0, 1.3, -0.4), shake: 0 };

// ---------- Helpers ----------
function bbColor(celsius) {
  const [r, g, b] = L.heatColor(celsius);
  return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
}

function smokyEnvironment(r) {
  // Reflections for the anvil and billet: a dark room, a warm hearth to the left,
  // a cool window to the right, a faint skylight.
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), new THREE.MeshBasicMaterial({ color: 0x040303, side: THREE.BackSide })));
  const soft = softboxTexture();
  [[4, 2, 0xff6a20, 3.5, [-7, 1, -4]], [2, 4, 0x9fb6ff, 1.6, [8, 3, 3]], [6, 2, 0xfff0e0, 0.6, [0, 9, 0]]].forEach(([w, h, c, i, p]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
      map: soft, color: new THREE.Color(c).multiplyScalar(i), transparent: true, side: THREE.DoubleSide, toneMapped: false
    }));
    m.position.set(p[0], p[1], p[2]);
    m.lookAt(0, 1, 0);
    env.add(m);
  });
  const pm = new THREE.PMREMGenerator(r);
  const t = pm.fromScene(env, 0.03).texture;
  pm.dispose();
  return t;
}

// A classic London-pattern anvil: side profile extruded, plus a conical horn.
function anvilGroup() {
  const s = new THREE.Shape();
  const P = [[-0.42, 0], [0.42, 0], [0.42, 0.07], [0.27, 0.12], [0.19, 0.27], [0.27, 0.39], [0.47, 0.42], [0.47, 0.5],
    [-0.58, 0.5], [-0.58, 0.43], [-0.34, 0.39], [-0.2, 0.27], [-0.28, 0.12], [-0.42, 0.07]];
  s.moveTo(P[0][0], P[0][1]);
  P.slice(1).forEach(([x, y]) => s.lineTo(x, y));
  const body = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 3, curveSegments: 1 });
  body.translate(0, 0, -0.15);
  const steel = new THREE.MeshPhysicalMaterial({ color: 0x2c2c30, metalness: 0.95, roughness: 0.42, clearcoat: 0.2, clearcoatRoughness: 0.5 });
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(body, steel);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.46, 32, 1), steel);
  horn.rotation.z = -Math.PI / 2;
  horn.scale.set(1, 1, 0.85);
  horn.position.set(0.69, 0.455, 0);
  horn.castShadow = true;
  g.add(horn);
  // The striking face is polished by years of work.
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.3).rotateX(-Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0x8a8a90, metalness: 1, roughness: 0.22 }));
  face.position.set(-0.06, 0.521, 0);
  g.add(face);
  g.userData.top = 0.521;
  return g;
}

function hammerGroup(wood) {
  const g = new THREE.Group();
  const steel = new THREE.MeshPhysicalMaterial({ color: 0x3b3b40, metalness: 1, roughness: 0.35 });
  const head = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.075, 0.2, 3, 0.012), steel);
  head.position.set(0, 0.0375, 0);          // origin = striking face
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.62, 12), new THREE.MeshStandardMaterial({ map: wood.map, roughness: 0.7 }));
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0.33, 0.045, 0);
  g.add(head, handle);
  g.traverse((o) => { o.castShadow = true; });
  g.visible = false;
  return g;
}

// Glowing coals: instanced rocks with a custom shader that breathes with the heat.
function coalBed() {
  const count = 320;
  const geo = new THREE.IcosahedronGeometry(0.05, 1);
  const seeds = new Float32Array(count);
  const mesh = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uGlow: { value: 0.2 }, uHot: { value: new THREE.Color(1, 0.4, 0.08) } },
    vertexShader: /* glsl */`
      attribute float aSeed;
      varying float vSeed; varying vec3 vN; varying vec3 vP;
      void main() {
        vSeed = aSeed;
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vP = wp.xyz;
        vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uGlow; uniform vec3 uHot;
      varying float vSeed; varying vec3 vN; varying vec3 vP;
      float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float n3(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main() {
        float pulse = 0.6 + 0.4 * sin(uTime * (0.5 + vSeed * 1.2) + vSeed * 30.0 + n3(vP * 3.0 + uTime * 0.2) * 4.0);
        // Glow lives in the gaps and undersides; the tops stay as dark ash-grey coal.
        float up = clamp(vN.y, 0.0, 1.0);
        float veins = smoothstep(0.45, 0.8, n3(vP * 22.0 + vSeed * 7.0));
        float glow = uGlow * pulse * (0.25 + 0.75 * veins) * mix(1.0, 0.35, up);
        vec3 coal = vec3(0.03, 0.028, 0.027) * (0.5 + up * 0.8);
        vec3 col = coal + uHot * glow * 2.6;
        gl_FragColor = vec4(col, 1.0);
      }
    `
  }), count);
  const rand = (a, b) => a + Math.random() * (b - a);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    p.set(HEARTH_POS.x + rand(-0.62, 0.62), COAL_TOP + rand(-0.01, 0.08) - Math.abs(rand(-0.62, 0.62)) * 0.05, HEARTH_POS.z + rand(-0.4, 0.4));
    e.set(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28));
    q.setFromEuler(e);
    const k = rand(0.55, 1.3);
    sc.set(k, k * rand(0.6, 1), k);
    m.compose(p, q, sc);
    mesh.setMatrixAt(i, m);
    seeds[i] = Math.random();
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  return mesh;
}

function flameSheets() {
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uHeight: { value: 0.3 }, uColor: { value: new THREE.Color(1, 0.45, 0.1) }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uHeight; uniform vec3 uColor; uniform float uOpacity;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 uv = vUv;
        float n = noise(vec2(uv.x * 5.0, uv.y * 3.0 - uTime * 2.2)) * 0.6 + noise(vec2(uv.x * 11.0, uv.y * 7.0 - uTime * 3.7)) * 0.4;
        float width = (1.0 - uv.y) * 0.5;
        float shape = smoothstep(width, width * 0.25, abs(uv.x - 0.5 + (n - 0.5) * 0.25 * uv.y));
        float fade = smoothstep(1.0, 0.25, uv.y / max(uHeight, 0.01)) * smoothstep(0.0, 0.08, uv.y);
        float a = shape * fade * (0.45 + n * 0.5) * uOpacity * 0.7;
        vec3 col = mix(uColor * 1.4, mix(uColor, vec3(1.0, 0.8, 0.45), 0.5) * 1.9, smoothstep(0.6, 0.0, uv.y));
        gl_FragColor = vec4(col * a, a);
      }
    `
  });
  for (let i = 0; i < 6; i++) {
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.9), mat);
    sheet.position.set(HEARTH_POS.x - 0.45 + i * 0.18, COAL_TOP + 0.42, HEARTH_POS.z + (i % 2 ? 0.1 : -0.12));
    sheet.rotation.y = (i % 3 - 1) * 0.5;
    g.add(sheet);
  }
  g.userData.mat = mat;
  return g;
}

// Generic GPU particle field rising from an area (embers or steam).
function riser({ count, area, speed, size, color, soft }) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * area.x;
    pos[i * 3 + 1] = Math.random() * area.y;
    pos[i * 3 + 2] = (Math.random() - 0.5) * area.z;
    seed[i] = Math.random();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  return new THREE.Points(geo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: soft ? THREE.NormalBlending : THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAmount: { value: 0 }, uPixel: { value: 1 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */`
      attribute float seed; uniform float uTime; uniform float uPixel;
      varying float vLife; varying float vSeed;
      void main() {
        vec3 p = position;
        float y = mod(p.y + uTime * (${speed.toFixed(3)} * (0.6 + seed)), ${area.y.toFixed(3)});
        vLife = y / ${area.y.toFixed(3)}; vSeed = seed;
        p.y = y;
        p.x += sin(uTime * (0.7 + seed) + seed * 40.0) * 0.12 * vLife;
        p.z += cos(uTime * (0.5 + seed) + seed * 13.0) * 0.08 * vLife;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (${size.toFixed(2)}) * (0.6 + seed * 0.8) * uPixel * ${soft ? '(0.6 + vLife * 1.6)' : '(1.0 - vLife * 0.6)'} / -mv.z;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uAmount; uniform vec3 uColor;
      varying float vLife; varying float vSeed;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * (1.0 - vLife) * smoothstep(0.0, 0.1, vLife) * step(vSeed, uAmount);
        ${soft ? 'gl_FragColor = vec4(uColor, a * 0.16);' : 'gl_FragColor = vec4(uColor * 4.0 * a, a);'}
      }
    `
  }));
}

// Spark burst for hammer strikes, simulated on the CPU (short-lived, few particles).
function sparkBurst() {
  const n = 90;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('life', new THREE.BufferAttribute(new Float32Array(n), 1));
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uPixel: { value: 1 } },
    vertexShader: /* glsl */`
      attribute float life; uniform float uPixel; varying float vLife;
      void main() {
        vLife = life;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (2.0 + 4.0 * life) * uPixel * 3.0 / -mv.z;
      }
    `,
    fragmentShader: /* glsl */`
      varying float vLife;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vLife;
        gl_FragColor = vec4(mix(vec3(1.0, 0.45, 0.1), vec3(1.0, 0.9, 0.6), vLife) * 5.0 * a, a);
      }
    `
  }));
  pts.userData = { vel: new Float32Array(n * 3), n, alive: 0 };
  pts.frustumCulled = false;
  return pts;
}

// Soft billowing steam for the quench (CPU simulated: it only lives for a couple of seconds).
function steamBurst() {
  const n = 80;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('life', new THREE.BufferAttribute(new Float32Array(n), 1));
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uPixel: { value: 1 }, uTint: { value: new THREE.Color(0xdfe5ea) } },
    vertexShader: /* glsl */`
      attribute float life; uniform float uPixel; varying float vLife;
      void main() {
        vLife = life;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (60.0 + (1.0 - life) * 190.0) * uPixel / -mv.z;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uTint; varying float vLife;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vLife * vLife * 0.32;
        gl_FragColor = vec4(uTint, a);
      }
    `
  }));
  pts.userData = { vel: new Float32Array(n * 3), n, alive: 0 };
  pts.frustumCulled = false;
  return pts;
}

function puff(at, strength = 1, tint = 0xdfe5ea) {
  const d = FIN.steam.userData;
  const pos = FIN.steam.geometry.attributes.position, life = FIN.steam.geometry.attributes.life;
  FIN.steam.material.uniforms.uTint.value.set(tint);
  for (let i = 0; i < d.n; i++) {
    pos.setXYZ(i, at.x + (Math.random() - 0.5) * 0.4, at.y + Math.random() * 0.1, at.z + (Math.random() - 0.5) * 0.3);
    d.vel[i * 3] = (Math.random() - 0.5) * 0.7 * strength;
    d.vel[i * 3 + 1] = (0.6 + Math.random() * 1.3) * strength;
    d.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.5 * strength;
    life.setX(i, 0.6 + Math.random() * 0.4);
  }
  d.alive = 2.6;
  pos.needsUpdate = life.needsUpdate = true;
}

function updateSteam(dt) {
  if (!FIN.steam) return;
  const d = FIN.steam.userData;
  if (d.alive <= 0) return;
  d.alive -= dt;
  const pos = FIN.steam.geometry.attributes.position, life = FIN.steam.geometry.attributes.life;
  for (let i = 0; i < d.n; i++) {
    let l = life.getX(i);
    if (l <= 0) continue;
    d.vel[i * 3] *= 0.985; d.vel[i * 3 + 1] *= 0.975; d.vel[i * 3 + 2] *= 0.985;
    pos.setXYZ(i, pos.getX(i) + d.vel[i * 3] * dt, pos.getY(i) + d.vel[i * 3 + 1] * dt, pos.getZ(i) + d.vel[i * 3 + 2] * dt);
    life.setX(i, Math.max(0, l - dt * 0.42));
  }
  pos.needsUpdate = life.needsUpdate = true;
}

function updateChunks(dt) {
  FIN.chunks.forEach((c) => {
    if (c.userData.rest) return;
    const v = c.userData.vel;
    v.y -= 9.8 * dt;
    c.position.addScaledVector(v, dt);
    c.rotation.x += c.userData.spin.x * dt;
    c.rotation.z += c.userData.spin.z * dt;
    const floorY = Math.abs(c.position.x - ANVIL_POS.x) < 0.55 && Math.abs(c.position.z - ANVIL_POS.z) < 0.2 ? anvilTop + 0.03 : 0.03;
    if (c.position.y < floorY) {
      c.position.y = floorY;
      v.y *= -0.25; v.x *= 0.5; v.z *= 0.5;
      c.userData.spin.multiplyScalar(0.5);
      if (Math.abs(v.y) < 0.2) c.userData.rest = true;
    }
  });
}

// ---------- Build ----------
function build(container) {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power', stencil: false });
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x070606, 1);
  const canvas = renderer.domElement;
  canvas.className = 'forge-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);
  RectAreaLightUniformsLib.init();

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070606);
  scene.fog = new THREE.FogExp2(0x070606, 0.075);
  scene.environment = smokyEnvironment(renderer);
  scene.environmentIntensity = 0.8;

  camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 40);
  camera.position.copy(cam.base);
  camera.lookAt(cam.look);

  const brick = brickSurface({ repeatX: 3, repeatY: 1.4 });
  const hearthBrick = brickSurface({ seed: 12, rows: 8, cols: 4 });
  const wood = woodSurface();
  const floorTex = floorSurface();

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: floorTex.map, normalMap: floorTex.normalMap, roughness: 0.82 }));
  floor.receiveShadow = true;
  scene.add(floor);

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 7),
    new THREE.MeshStandardMaterial({ map: brick.map, normalMap: brick.normalMap, roughness: 0.92 }));
  wall.position.set(0, 3.5, -2.6);
  wall.receiveShadow = true;
  scene.add(wall);

  // Hearth: brick base, coal bed, iron hood and chimney.
  const hearth = new THREE.Mesh(new RoundedBoxGeometry(1.6, COAL_TOP, 1.2, 3, 0.03),
    new THREE.MeshStandardMaterial({ map: hearthBrick.map, normalMap: hearthBrick.normalMap, roughness: 0.9 }));
  hearth.position.set(HEARTH_POS.x, COAL_TOP / 2, HEARTH_POS.z);
  hearth.castShadow = hearth.receiveShadow = true;
  scene.add(hearth);
  const iron = new THREE.MeshPhysicalMaterial({ color: 0x1c1a19, metalness: 0.8, roughness: 0.55 });
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 1.05, 1.3, 4, 1, true), iron);
  hood.rotation.y = Math.PI / 4;
  hood.position.set(HEARTH_POS.x, 2.65, HEARTH_POS.z);
  scene.add(hood);
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 3, 4, 1, true), iron);
  chimney.rotation.y = Math.PI / 4;
  chimney.position.set(HEARTH_POS.x, 4.8, HEARTH_POS.z);
  scene.add(chimney);

  coals = coalBed();
  scene.add(coals);
  flames = flameSheets();
  scene.add(flames);
  embers = riser({ count: 120, area: new THREE.Vector3(1.1, 2.4, 0.6), speed: 0.35, size: 9, color: 0xff7a2a });
  embers.position.set(HEARTH_POS.x, COAL_TOP + 0.05, HEARTH_POS.z);
  scene.add(embers);

  // Stump, anvil, billet.
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.46, 0.66, 32),
    new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normalMap, roughness: 0.85, color: 0x9a8a7c }));
  stump.position.set(ANVIL_POS.x, 0.33, ANVIL_POS.z);
  stump.castShadow = stump.receiveShadow = true;
  scene.add(stump);
  const anvil = anvilGroup();
  anvil.position.copy(ANVIL_POS);
  anvil.rotation.y = -0.18;
  scene.add(anvil);
  anvilTop = ANVIL_POS.y + anvil.userData.top;

  const tex = billetSurface({ cracks: 0 });
  billetMat = new THREE.MeshPhysicalMaterial({
    color: 0x55555a, map: tex.map, metalness: 0.75, roughness: 0.5,
    emissive: new THREE.Color(0, 0, 0), emissiveMap: tex.emissiveMap, emissiveIntensity: 0
  });
  billet = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.1, 0.13, 3, 0.022), billetMat);
  billet.position.set(ANVIL_POS.x - 0.08, anvilTop + 0.05, ANVIL_POS.z + 0.01);
  billet.rotation.y = 0.12;
  billet.castShadow = true;
  scene.add(billet);
  billetLight = new THREE.PointLight(0xff6a20, 0, 2.6, 2);
  billetLight.position.set(billet.position.x, anvilTop + 0.25, billet.position.z + 0.15);
  scene.add(billetLight);

  steam = riser({ count: 60, area: new THREE.Vector3(0.6, 1.2, 0.2), speed: 0.18, size: 140, color: 0xcfd6dd, soft: true });
  steam.position.set(billet.position.x, anvilTop + 0.08, billet.position.z);
  scene.add(steam);

  // Quench barrel and a rack of tools on the wall, for depth.
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.62, 28),
    new THREE.MeshStandardMaterial({ map: wood.map, roughness: 0.8, color: 0x6e5a4a }));
  barrel.position.set(3.4, 0.31, -0.8);
  barrel.castShadow = barrel.receiveShadow = true;
  scene.add(barrel);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.27, 28).rotateX(-Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0x050607, roughness: 0.05, metalness: 0, transmission: 0, clearcoat: 1 }));
  water.position.set(3.4, 0.58, -0.8);
  scene.add(water);
  const toolMat = new THREE.MeshPhysicalMaterial({ color: 0x24242a, metalness: 0.9, roughness: 0.5 });
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Group();
    const len = 0.7 + (i % 2) * 0.25;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, len, 8), toolMat);
    handle.position.y = -len / 2;
    t.add(handle);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(i % 2 ? 0.16 : 0.06, 0.06, 0.05), toolMat);
    tip.position.y = -len;
    t.add(tip);
    t.position.set(1.3 + i * 0.34, 2.7, -2.5);
    t.rotation.z = (i - 1.5) * 0.04;
    t.traverse((o) => { o.castShadow = true; });
    scene.add(t);
  }

  hammer = hammerGroup(wood);
  scene.add(hammer);
  sparks = sparkBurst();
  scene.add(sparks);
  FIN.steam = steamBurst();
  scene.add(FIN.steam);
  FIN.spot = new THREE.SpotLight(0xfff1e0, 0, 8, 0.42, 0.55, 1.1);
  FIN.spot.position.set(ANVIL_POS.x - 0.2, 4.2, ANVIL_POS.z + 1.4);
  FIN.spot.target.position.set(ANVIL_POS.x - 0.08, anvilTop, ANVIL_POS.z);
  scene.add(FIN.spot, FIN.spot.target);
  // A warm front fill for the reveal so the finished ingot reads clearly behind the card.
  FIN.fill = new THREE.PointLight(0xffd8b0, 0, 5, 1.4);
  FIN.fill.position.set(ANVIL_POS.x + 0.6, anvilTop + 0.9, ANVIL_POS.z + 1.3);
  scene.add(FIN.fill);

  // Lighting: the hearth (shadow-casting key), a cool window rim, faint ambient, exam spotlight.
  hemi = new THREE.HemisphereLight(0x2a3040, 0x0d0907, 0.6);
  scene.add(hemi);
  hearthLight = new THREE.SpotLight(0xff6a20, 20, 9, Math.PI / 3, 0.8, 2);
  hearthLight.position.set(HEARTH_POS.x + 0.2, COAL_TOP + 0.55, HEARTH_POS.z + 0.35);
  hearthLight.target.position.set(ANVIL_POS.x, 0.6, ANVIL_POS.z + 0.6);
  hearthLight.castShadow = true;
  hearthLight.shadow.mapSize.set(1024, 1024);
  hearthLight.shadow.bias = -0.0006;
  hearthLight.shadow.radius = 5;
  scene.add(hearthLight, hearthLight.target);
  const hearthFill = new THREE.PointLight(0xff6a20, 4, 3.5, 2);
  hearthFill.position.set(HEARTH_POS.x, COAL_TOP + 0.4, HEARTH_POS.z + 0.2);
  scene.add(hearthFill);
  hearthLight.userData.fill = hearthFill;
  windowLight = new THREE.RectAreaLight(0x9fb4ff, 4, 1.4, 2.4);
  windowLight.position.set(4.4, 2.6, 1.6);
  windowLight.lookAt(ANVIL_POS.x, 1.0, ANVIL_POS.z);
  scene.add(windowLight);
  // Soft key on the anvil so it reads even when the forge is cold.
  const anvilKey = new THREE.SpotLight(0xffe2c4, 22, 9, 0.42, 0.85, 1.8);
  anvilKey.position.set(0.9, 3.6, 2.8);
  anvilKey.target.position.set(ANVIL_POS.x, 0.9, ANVIL_POS.z);
  scene.add(anvilKey, anvilKey.target);
  examSpot = new THREE.SpotLight(0xf2f5ff, 0, 7, 0.36, 0.45, 1.6);
  examSpot.position.set(ANVIL_POS.x - 0.1, 4.6, ANVIL_POS.z + 0.6);
  examSpot.target.position.set(ANVIL_POS.x - 0.1, anvilTop, ANVIL_POS.z);
  examSpot.castShadow = true;
  examSpot.shadow.mapSize.set(1024, 1024);
  scene.add(examSpot, examSpot.target);

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  haze = new ShaderPass(HeatHazeShader);
  composer.addPass(haze);
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.6, 1.25);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  clock = new THREE.Clock(false);
}

// ---------- Hammer strike ----------
const KEYS = [ // time, position offset from impact point, z-rotation
  [0.0, [0.9, 1.4, 0.6], 1.0],
  [0.3, [0.45, 0.55, 0.25], -0.5],
  [0.4, [0.0, 0.0, 0.0], 0.15],
  [0.5, [0.08, 0.12, 0.04], 0.0],
  [0.85, [0.9, 1.4, 0.6], 1.0]
];

function startStrike() {
  if (strike.t >= 0 || F.calm || reducedMotion) return;
  strike.t = 0;
  strike.impactDone = false;
  hammer.visible = true;
}

function updateStrike(dt) {
  if (strike.t < 0) return;
  strike.t += dt;
  const t = strike.t;
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) if (t >= KEYS[i][0] && t <= KEYS[i + 1][0]) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  const u = Math.min(1, Math.max(0, (t - a[0]) / Math.max(0.001, b[0] - a[0])));
  const e = a[0] === 0.3 ? u * u * u : u * u * (3 - 2 * u); // the downswing accelerates
  const impact = new THREE.Vector3(billet.position.x + 0.05, billet.position.y + 0.05, billet.position.z);
  hammer.position.set(
    impact.x + a[1][0] + (b[1][0] - a[1][0]) * e,
    impact.y + a[1][1] + (b[1][1] - a[1][1]) * e,
    impact.z + a[1][2] + (b[1][2] - a[1][2]) * e
  );
  hammer.rotation.set(0, -0.6, a[2] + (b[2] - a[2]) * e);
  if (!strike.impactDone && t >= 0.4) {
    strike.impactDone = true;
    burst(impact);
    cam.shake = 1;
    billet.userData.squash = 1;
    if (SF.sound) SF.sound.play('anvil');
  }
  if (t >= KEYS[KEYS.length - 1][0]) { strike.t = -1; hammer.visible = false; }
}

function burst(at) {
  const d = sparks.userData;
  const pos = sparks.geometry.attributes.position, life = sparks.geometry.attributes.life;
  const hot = Math.max(0.35, L.glowAmount(F.temp));
  for (let i = 0; i < d.n; i++) {
    pos.setXYZ(i, at.x, at.y, at.z);
    const ang = Math.random() * Math.PI * 2, up = 0.6 + Math.random() * 2.4, out = 0.8 + Math.random() * 2.4;
    d.vel[i * 3] = Math.cos(ang) * out;
    d.vel[i * 3 + 1] = up;
    d.vel[i * 3 + 2] = Math.sin(ang) * out * 0.7 + 0.6;
    life.setX(i, (0.6 + Math.random() * 0.4) * hot);
  }
  d.alive = 1.2;
  pos.needsUpdate = life.needsUpdate = true;
}

function updateSparks(dt) {
  const d = sparks.userData;
  if (d.alive <= 0) return;
  d.alive -= dt;
  const pos = sparks.geometry.attributes.position, life = sparks.geometry.attributes.life;
  for (let i = 0; i < d.n; i++) {
    let l = life.getX(i);
    if (l <= 0) continue;
    d.vel[i * 3 + 1] -= 6.5 * dt;
    let y = pos.getY(i) + d.vel[i * 3 + 1] * dt;
    if (y < 0.01) { y = 0.01; d.vel[i * 3 + 1] *= -0.3; d.vel[i * 3] *= 0.5; d.vel[i * 3 + 2] *= 0.5; }
    pos.setXYZ(i, pos.getX(i) + d.vel[i * 3] * dt, y, pos.getZ(i) + d.vel[i * 3 + 2] * dt);
    l -= dt * 1.1;
    life.setX(i, Math.max(0, l));
  }
  pos.needsUpdate = life.needsUpdate = true;
}

// ---------- Per-frame look ----------
function targets() {
  const s = F.snap || { heatMin: 0, stage: 0, cracks: 0, mode: 'stopwatch', phase: 'work', status: 'ready' };
  const onBreak = s.mode === 'timer' && s.phase === 'break';
  const idle = s.status === 'paused' || s.status === 'ready';
  let temp = L.tempFromHeat(s.heatMin);
  if (FIN.quenched) temp = 20;
  if (onBreak) temp = Math.min(temp, 380);       // the billet cools while you rest
  else if (idle) temp = Math.min(temp, Math.max(20, temp * 0.85));
  const heatNorm = Math.min(1, s.heatMin / 70);
  let coal = 0.18 + 0.82 * heatNorm;
  if (onBreak) coal = 0.12;
  if (idle) coal *= 0.7;
  return {
    temp, coal,
    exam: s.mode === 'exam' ? 1 : 0,
    rest: onBreak ? 1 : 0,
    legend: s.stage >= 4 ? 1 : 0
  };
}

function apply(dt, realDt) {
  const T = targets();
  const k = reducedMotion || F.calm ? 1 : 1 - Math.pow(0.25, dt); // ~ease over a few seconds
  // Temperature changes like real metal: heats briskly, cools a little slower.
  // Paced by real time (not frames), so it heats correctly at any frame rate.
  const rate = (T.temp > F.temp ? 260 : 160) * realDt;
  F.temp = reducedMotion || F.calm ? T.temp : F.temp + Math.max(-rate, Math.min(rate, T.temp - F.temp));
  F.coal += (T.coal - F.coal) * k;
  F.exam += (T.exam - F.exam) * k;
  F.rest += (T.rest - F.rest) * k;
  F.legend += (T.legend - F.legend) * k;

  // Billet: blackbody emission, nudged blue-white at Legendary.
  const glow = L.glowAmount(F.temp);
  const c = bbColor(F.temp).lerp(new THREE.Color(0.75, 0.88, 1.0), F.legend * 0.6);
  billetMat.emissive.copy(c);
  billetMat.emissiveIntensity = glow * 5.2;
  billetMat.roughness = 0.5 - glow * 0.2;
  billetLight.color.copy(c);
  billetLight.intensity = glow * 3.5;

  // Coals and flames: orange, shifting toward blue-white at Legendary; muted in exams.
  const hot = new THREE.Color(1, 0.38, 0.07).lerp(new THREE.Color(0.55, 0.75, 1.0), F.legend * 0.7);
  const coalGlow = F.coal * (1 - F.exam * 0.45);
  coals.material.uniforms.uGlow.value = coalGlow;
  coals.material.uniforms.uHot.value.copy(hot);
  flames.userData.mat.uniforms.uHeight.value = 0.2 + coalGlow * 0.55;
  flames.userData.mat.uniforms.uOpacity.value = Math.max(0, coalGlow - 0.15) * 1.2;
  flames.userData.mat.uniforms.uColor.value.copy(hot);
  embers.material.uniforms.uAmount.value = Math.max(0, coalGlow - 0.1) * 0.9;
  embers.material.uniforms.uColor.value.copy(hot);
  steam.material.uniforms.uAmount.value = F.rest * 0.9;

  hearthLight.color.copy(hot);
  hearthLight.intensity = 3 + coalGlow * 26;
  hearthLight.userData.fill.color.copy(hot);
  hearthLight.userData.fill.intensity = 1 + coalGlow * 7;

  // Exam: cold, stark — a single overhead spotlight, cooler room, less warmth.
  examSpot.intensity = F.exam * 70;
  windowLight.intensity = 4 + F.exam * 1.5 + F.rest * 1.5;
  hemi.intensity = 0.6 + F.rest * 0.2;
  hemi.color.setRGB(0.16 + F.exam * 0.05, 0.19 + F.exam * 0.06, 0.25 + F.exam * 0.12);
  // Ember-up: the room brightens over ~2 s when a session starts.
  F.fade += (1 - F.fade) * (reducedMotion || F.calm ? 1 : 1 - Math.pow(0.18, dt));
  const lift = FIN.lift.v;
  renderer.toneMappingExposure = (1.0 - F.exam * 0.12 - F.rest * 0.08) * F.fade * (1 + lift * 0.55);
  hemi.intensity += lift * 0.9;
  if (FIN.fill) FIN.fill.intensity = lift * 9;

  // Heat haze over the coals (and over the billet when it's glowing).
  if (haze.enabled) {
    const p = tmpV.set(HEARTH_POS.x, COAL_TOP + 0.1, HEARTH_POS.z).project(camera);
    haze.uniforms.uCenter.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    haze.uniforms.uSize.value.set(0.13, 0.13 * camera.aspect);
    haze.uniforms.uStrength.value = reducedMotion || F.calm ? 0 : coalGlow * 1.4;
  }
}

function frame() {
  const raw = clock.getDelta();
  const dt = Math.min(0.1, raw);
  F.real = (F.real || 0) + Math.min(2, raw);
  F.acc += dt;
  const animate = !(F.calm || reducedMotion);
  if (animate && F.acc < 1 / FPS) return;
  if (!animate && !F.dirty) return;
  const step = F.acc;
  F.acc = 0;
  F.dirty = false;
  const t0 = performance.now();

  if (animate) F.time += step;
  apply(step, F.real);
  F.real = 0;
  updateStrike(step);
  updateSparks(step);
  updateSteam(step);
  updateChunks(step);

  // Billet squash on impact, gentle camera kick.
  const sq = billet.userData.squash || 0;
  billet.scale.set(1 + sq * 0.05, 1 - sq * 0.12, 1 + sq * 0.05);
  billet.userData.squash = Math.max(0, sq - step * 6);
  cam.shake = Math.max(0, cam.shake - step * 5);
  // Breathing camera: a few millimetres of drift over a minute, so the shot never feels frozen.
  const drift = animate ? 1 : 0;
  camera.position.set(
    cam.base.x + Math.sin(F.time * 0.05) * 0.04 * drift + (Math.random() - 0.5) * 0.012 * cam.shake,
    cam.base.y + Math.sin(F.time * 0.037) * 0.02 * drift + (Math.random() - 0.5) * 0.012 * cam.shake,
    cam.base.z
  );
  camera.lookAt(cam.look);

  const u = F.time;
  coals.material.uniforms.uTime.value = u;
  flames.userData.mat.uniforms.uTime.value = u;
  embers.material.uniforms.uTime.value = u;
  steam.material.uniforms.uTime.value = u;
  haze.uniforms.uTime.value = u;
  const pr = renderer.getPixelRatio();
  [embers, steam, sparks, FIN.steam].forEach((p) => { p.material.uniforms.uPixel.value = pr; });

  composer.render(step);

  // Adaptive quality: if frames are slow, drop resolution, then haze and shadows.
  const ms = performance.now() - t0;
  if (animate && ms > 22) {
    if (++F.slowFrames > 40 && F.quality > 0.5) {
      F.quality -= 0.2;
      F.slowFrames = 0;
      if (F.quality < 0.7) { haze.enabled = false; hearthLight.castShadow = false; examSpot.castShadow = false; }
      resize();
    }
  } else {
    F.slowFrames = Math.max(0, F.slowFrames - 1);
  }
}

// ---------- v3 finale ----------
const BILLET_HOME = new THREE.Vector3();
const CAM_HOME = { base: new THREE.Vector3(), look: new THREE.Vector3() };

function finishedIngot(alloyId, dull) {
  const g = ingotGeometry();
  const mat = new THREE.MeshPhysicalMaterial({
    color: FIN_METALS[alloyId] || FIN_METALS.bronze, metalness: 1, roughness: dull ? 0.62 : 0.2,
    clearcoat: dull ? 0 : 0.3, clearcoatRoughness: 0.2,
    emissive: new THREE.Color(1, 0.35, 0.08), emissiveIntensity: 0
  });
  if (alloyId === 'mythril') Object.assign(mat, { iridescence: 1, iridescenceIOR: 1.8 });
  const m = new THREE.Mesh(g, mat);
  m.scale.setScalar(0.4);
  m.castShadow = true;
  return m;
}

function resetFinale() {
  if (FIN.tl) { FIN.tl.kill(); FIN.tl = null; }
  if (FIN.ingot) { scene.remove(FIN.ingot); FIN.ingot.geometry.dispose(); FIN.ingot.material.dispose(); FIN.ingot = null; }
  FIN.chunks.forEach((c) => { scene.remove(c); c.geometry.dispose(); });
  FIN.chunks = [];
  FIN.quenched = false;
  FIN.active = false;
  if (BILLET_HOME.lengthSq()) {
    billet.position.copy(BILLET_HOME);
    billet.rotation.set(0, 0.12, 0);
    billet.visible = true;
    cam.base.copy(CAM_HOME.base);
    cam.look.copy(CAM_HOME.look);
  }
  if (FIN.spot) FIN.spot.intensity = 0;
  FIN.lift.v = 0;
}

/**
 * The end of a session, played in the forge: quench and reveal ('complete' / 'unfinished'),
 * or the billet cracking apart ('fail'). Timed to sit under the finale card's ~7 s sequence.
 */
function finale(kind, alloyId) {
  const gsap = window.gsap;
  if (!F.mounted || !gsap) return false;
  resetFinale();
  if (!BILLET_HOME.lengthSq()) {
    BILLET_HOME.copy(billet.position);
    CAM_HOME.base.copy(cam.base);
    CAM_HOME.look.copy(cam.look);
  }
  FIN.active = true;
  F.dirty = true;
  const tl = gsap.timeline({ onUpdate: () => { F.dirty = true; } });
  FIN.tl = tl;
  // Frame the anvil and the quench barrel on the right of the screen.
  tl.to(cam.base, { x: 1.2, y: 1.7, z: 3.5, duration: 1.4, ease: 'power2.inOut' }, 0)
    .to(cam.look, { x: 2.75, y: 0.95, z: -0.3, duration: 1.4, ease: 'power2.inOut' }, 0);

  if (kind === 'fail') {
    tl.to(billetMat, { emissiveIntensity: 9, duration: 0.12, yoyo: true, repeat: 5, ease: 'none' }, 1.0)
      .call(() => {
        billet.visible = false;
        const pieces = 6;
        for (let i = 0; i < pieces; i++) {
          const c = new THREE.Mesh(new RoundedBoxGeometry(0.72 / pieces * (0.8 + Math.random() * 0.4), 0.09, 0.12, 2, 0.01), billetMat);
          c.position.set(billet.position.x - 0.36 + (i + 0.5) * 0.72 / pieces, billet.position.y, billet.position.z);
          c.rotation.y = billet.rotation.y;
          c.castShadow = true;
          c.userData = {
            vel: new THREE.Vector3((Math.random() - 0.5) * 1.6, 1 + Math.random() * 1.6, (Math.random() - 0.2) * 1.2),
            spin: new THREE.Vector3((Math.random() - 0.5) * 9, 0, (Math.random() - 0.5) * 9)
          };
          scene.add(c);
          FIN.chunks.push(c);
        }
        burst(billet.position.clone());
        puff(billet.position.clone(), 0.6, 0x6b5f57);
        if (SF.sound) SF.sound.play('crack');
      }, null, 1.75)
      .call(() => { FIN.quenched = true; }, null, 2.6)
      .to(FIN.lift, { v: 0.45, duration: 1.2, ease: 'power2.out' }, 2.6);
    return true;
  }

  const lift = billet.position.y + 0.5;
  const over = new THREE.Vector3(BARREL_POS.x, 1.35, BARREL_POS.z);
  // The finished ingot exists from the start (hidden), so the whole sequence is one timeline.
  const ing = finishedIngot(alloyId, kind === 'unfinished');
  ing.position.set(BARREL_POS.x, 0.4, BARREL_POS.z);
  ing.rotation.set(0, 1.2, -0.4);
  ing.visible = false;
  scene.add(ing);
  FIN.ingot = ing;
  FIN.kind = kind;

  tl.to(billet.position, { y: lift, duration: 0.5, ease: 'power2.out' }, 1.0)
    .to(billet.rotation, { z: 0.15, duration: 0.5 }, 1.0)
    .to(billet.position, { x: over.x, z: over.z, y: over.y, duration: 0.55, ease: 'power2.inOut' }, 1.5)
    .to(billet.rotation, { z: -0.6, y: 1.2, duration: 0.55, ease: 'power2.inOut' }, 1.5)
    .to(billet.position, { y: 0.42, duration: 0.22, ease: 'power3.in' }, 2.05)
    .call(() => {
      FIN.quenched = true;
      F.temp = 20;
      puff(new THREE.Vector3(BARREL_POS.x, 0.62, BARREL_POS.z), 1.2);
      if (SF.sound) SF.sound.play('quench');
    }, null, 2.25)
    .call(() => { billet.visible = false; ing.visible = true; }, null, 2.5)
    // Out of the steam, over to the anvil, settle under the spotlight, then a slow turn.
    .to(ing.position, { y: 1.45, duration: 0.7, ease: 'power2.out' }, 2.6)
    .to(ing.rotation, { z: 0, x: 0, duration: 0.7, ease: 'power2.out' }, 2.6)
    .to(ing.position, { x: ANVIL_POS.x - 0.1, z: ANVIL_POS.z + 0.02, duration: 0.6, ease: 'power2.inOut' }, 3.3)
    .to(ing.position, { y: anvilTop + 0.002, duration: 0.35, ease: 'bounce.out' }, 3.85)
    .to(ing.rotation, { y: 0.35, duration: 0.95, ease: 'power2.inOut' }, 3.3)
    .to(FIN.spot, { intensity: kind === 'unfinished' ? 30 : 70, duration: 0.8, ease: 'power2.out' }, 3.8)
    .to(FIN.lift, { v: kind === 'unfinished' ? 0.6 : 1, duration: 1.2, ease: 'power2.out' }, 3.6)
    .to(ing.rotation, { y: 0.35 + Math.PI * 0.35, duration: 6, ease: 'sine.inOut' }, 4.3);
  return true;
}

// Jump to the end state without replaying sounds or bursts.
function finaleSkip() {
  if (!FIN.tl) return;
  FIN.tl.progress(1, true);
  FIN.quenched = true;
  F.temp = 20;
  if (FIN.ingot) { billet.visible = false; FIN.ingot.visible = true; }
  F.dirty = true;
}

// ---------- Size & lifecycle ----------
let container = null;
function resize() {
  if (!renderer || !container) return;
  const w = container.clientWidth, h = container.clientHeight;
  if (!w || !h) return;
  // A backdrop doesn't need full resolution: render slightly below native and let the
  // browser scale; it keeps a multi-hour session cool and quiet.
  const pr = Math.min(window.devicePixelRatio || 1, 1.25) * 0.85 * F.quality;
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  // Keep the anvil and hearth in frame on narrow windows.
  camera.fov = camera.aspect < 1.4 ? 50 : 40;
  camera.updateProjectionMatrix();
  F.dirty = true;
}

function updateRunning() {
  if (!renderer) return;
  const run = F.mounted && F.active && !document.hidden;
  if (run === F.running) return;
  F.running = run;
  if (run) { clock.start(); clock.getDelta(); F.dirty = true; }
  renderer.setAnimationLoop(run ? frame : null);
}

function mount(el) {
  container = el;
  build(el);
  F.mounted = true;
  new ResizeObserver(resize).observe(el);
  document.addEventListener('visibilitychange', updateRunning);
  resize();
  updateRunning();
}

/**
 * Feed the forge the live session. Called a few times a second by the session screen.
 * snap: { heatMin, stage, cracks, mode, phase, status, ingots }
 */
function update(snap) {
  const prev = F.snap;
  F.snap = snap;
  if (!F.mounted) return;
  if (snap.cracks !== F.cracks) {
    F.cracks = snap.cracks;
    const t = billetSurface({ cracks: Math.min(3, snap.cracks) });
    if (billetMat.map) billetMat.map.dispose();
    if (billetMat.emissiveMap) billetMat.emissiveMap.dispose();
    billetMat.map = t.map;
    billetMat.emissiveMap = t.emissiveMap;
    billetMat.needsUpdate = true;
  }
  // A strike for every whole Ingot earned while you're actually studying.
  if (F.lastIngots == null || !prev || prev.sessionId !== snap.sessionId) {
    F.lastIngots = snap.ingots;
    if (FIN.active || FIN.quenched) resetFinale();
  }
  if (snap.ingots > F.lastIngots) {
    F.lastIngots = snap.ingots;
    if (snap.status === 'running') startStrike();
  }
  if (!prev || prev.stage !== snap.stage || prev.mode !== snap.mode || prev.phase !== snap.phase ||
      prev.status !== snap.status || Math.abs(prev.heatMin - snap.heatMin) > 0.5) F.dirty = true;
}

function setActive(on) {
  if (on && !F.active) F.fade = 0.1;
  F.active = on;
  if (on) F.dirty = true;
  updateRunning();
}

function setCalm(on) {
  F.calm = !!on;
  F.dirty = true;
}

SF.forge3d = { mount, update, setActive, setCalm, strike: startStrike, finale, finaleSkip };
