// Molten metal, embers, heat haze, light beam and dust.
import * as THREE from 'three';

const NOISE = /* glsl */`
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int k = 0; k < 5; k++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
  }
`;

// HDR molten surface: values well above 1.0 so the bloom pass makes it glow.
export function moltenMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uTint: { value: new THREE.Color(color) },
      uHeat: { value: 1 }
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uTint; uniform float uHeat;
      varying vec2 vUv;
      ${NOISE}
      void main() {
        vec2 p = vUv * vec2(6.0, 3.1);
        float t = uTime * 0.12;
        // Slow convection: domain-warped noise drifting across the surface.
        vec2 warp = vec2(fbm(p + vec2(t, 0.0)), fbm(p + vec2(0.0, -t) + 4.3));
        float n = fbm(p + warp * 1.8 + vec2(t * 0.6, -t * 0.4));
        float crust = smoothstep(0.55, 0.7, fbm(p * 1.7 - warp + t * 0.3));
        vec3 deep = vec3(1.0, 0.16, 0.01);
        vec3 bright = mix(vec3(1.0, 0.42, 0.05), uTint, 0.15);
        vec3 white = vec3(1.0, 0.72, 0.28);
        vec3 col = mix(deep, bright, smoothstep(0.3, 0.75, n));
        col = mix(col, white, pow(smoothstep(0.55, 0.95, n), 2.0));
        col = mix(col, vec3(0.1, 0.025, 0.01), crust * 0.78);
        // Meniscus: metal climbs and glows hottest where it meets the mould wall.
        vec2 e = min(vUv, 1.0 - vUv) * vec2(1.6, 3.0);
        float edge = 1.0 - smoothstep(0.0, 0.12, min(e.x, e.y));
        col += vec3(1.0, 0.45, 0.1) * edge * 0.8;
        gl_FragColor = vec4(col * (2.4 + 0.3 * uHeat), 1.0);
      }
    `
  });
}

// Soft, glowing sparks rising from the mould.
export function createEmbers(count, area) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * area.x;
    pos[i * 3 + 1] = Math.random() * area.y;
    pos[i * 3 + 2] = (Math.random() - 0.5) * area.z;
    seed[i] = Math.random();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uHeight: { value: area.y }, uPixel: { value: 1 } },
    vertexShader: /* glsl */`
      attribute float seed;
      uniform float uTime; uniform float uHeight; uniform float uPixel;
      varying float vLife;
      void main() {
        vec3 p = position;
        float speed = 0.25 + seed * 0.35;
        float y = mod(p.y + uTime * speed, uHeight);
        vLife = y / uHeight;
        p.y = y;
        p.x += sin(uTime * (0.8 + seed) + seed * 40.0) * 0.06 * vLife;
        p.z += cos(uTime * (0.7 + seed) + seed * 17.0) * 0.04 * vLife;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.2 + seed * 2.0) * uPixel * (1.0 - vLife * 0.6) * (4.5 / -mv.z);
      }
    `,
    fragmentShader: /* glsl */`
      varying float vLife;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * (1.0 - vLife) * smoothstep(0.0, 0.08, vLife);
        gl_FragColor = vec4(vec3(1.0, 0.55, 0.15) * 4.0 * a, a);
      }
    `
  });
  return new THREE.Points(geo, mat);
}

// Faint volumetric-looking beam of light from above, with dust drifting through it.
export function createLightBeam() {
  const group = new THREE.Group();
  const cone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 1.6, 4.2, 48, 1, true),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uOpacity: { value: 0.06 } },
      vertexShader: /* glsl */`
        varying float vY; varying vec3 vN; varying vec3 vView;
        void main() {
          vY = uv.y;
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uOpacity;
        varying float vY; varying vec3 vN; varying vec3 vView;
        void main() {
          float facing = pow(abs(dot(vN, vView)), 1.5);
          float a = uOpacity * facing * smoothstep(0.0, 0.35, vY) * smoothstep(1.0, 0.7, vY);
          gl_FragColor = vec4(vec3(1.0, 0.95, 0.88) * a, a);
        }
      `
    })
  );
  cone.position.y = 2.1;
  group.add(cone);

  const n = 160;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = Math.random() * 1.3, a = Math.random() * Math.PI * 2;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.random() * 3.6;
    pos[i * 3 + 2] = Math.sin(a) * r;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(geo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPixel: { value: 1 } },
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uPixel;
      varying float vA;
      void main() {
        vec3 p = position;
        float s = fract(sin(dot(p.xz, vec2(12.9, 78.2))) * 43758.5);
        p.y = mod(p.y - uTime * (0.03 + s * 0.04), 3.6);
        p.x += sin(uTime * 0.2 + s * 30.0) * 0.15;
        vA = smoothstep(0.0, 0.6, p.y) * smoothstep(3.6, 2.6, p.y) * (0.4 + s * 0.6);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.0 + s * 1.6) * uPixel * (5.0 / -mv.z);
      }
    `,
    fragmentShader: /* glsl */`
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA * 0.5;
        gl_FragColor = vec4(vec3(1.0, 0.96, 0.9) * a, a);
      }
    `
  }));
  group.add(dust);
  group.userData = { cone, dust };
  return group;
}

// Screen-space heat shimmer rising above the molten metal.
export const HeatHazeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uSize: { value: new THREE.Vector2(0.2, 0.2) },
    uStrength: { value: 0 }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uCenter; uniform vec2 uSize; uniform float uStrength;
    varying vec2 vUv;
    ${NOISE}
    void main() {
      vec2 d = (vUv - uCenter) / uSize;
      // Only above the metal surface, strongest just over it, fading as it rises.
      float above = smoothstep(-0.15, 0.25, d.y) * smoothstep(1.6, 0.3, d.y);
      float mask = above * smoothstep(1.0, 0.35, abs(d.x)) * uStrength;
      vec2 q = vec2(vUv.x * 40.0, vUv.y * 28.0 - uTime * 3.2);
      vec2 off = vec2(noise(q) - 0.5, noise(q + 7.1) - 0.5) * 0.006 * mask;
      gl_FragColor = texture2D(tDiffuse, vUv + off);
    }
  `
};
