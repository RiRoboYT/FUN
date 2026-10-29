// Studio lighting for reflections: a dark room with "lightformers" (emissive softboxes),
// prefiltered with PMREM into an environment map. This is the same technique product
// renderers use when they don't want a photographic HDRI baked into the reflections.
import * as THREE from 'three';
import { softboxTexture } from './textures.js';

export function createStudioEnvironment(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(
    new THREE.SphereGeometry(40, 48, 24),
    new THREE.MeshBasicMaterial({ color: 0x050506, side: THREE.BackSide })
  ));

  const soft = softboxTexture();
  const formers = [
    // [width, height, colour, intensity, position, look-at]
    [9, 2.2, 0xffffff, 2.2, [0, 9, 1], [0, 0, 0]],           // overhead softbox
    [1.2, 12, 0xfff3e6, 3.6, [-8, 3, 4], [0, 1, 0]],         // tall strip, left front: long highlight lines
    [1.2, 12, 0xe9f1ff, 2.8, [8, 3, 3], [0, 1, 0]],          // tall strip, right front (cooler)
    [10, 0.8, 0xffffff, 4.0, [0, 4, -9], [0, 1, 0]],         // thin rim strip behind
    [6, 1.6, 0xff7a2c, 2.2, [-6, 0.4, -6], [0, 0.5, 0]],     // warm forge kick, low behind-left
    [3, 3, 0xffffff, 1.4, [0, 2.5, 10], [0, 0.5, 0]]         // camera-side fill / catch light
  ];
  formers.forEach(([w, h, color, intensity, p, look]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: soft, color: new THREE.Color(color).multiplyScalar(intensity),
        side: THREE.DoubleSide, transparent: true, toneMapped: false
      })
    );
    m.position.set(p[0], p[1], p[2]);
    m.lookAt(look[0], look[1], look[2]);
    env.add(m);
  });

  // A faint floor bounce so undersides aren't pure black.
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 32), new THREE.MeshBasicMaterial({ color: 0x14100c }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2;
  env.add(floor);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(env, 0.02);
  pmrem.dispose();
  env.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  soft.dispose();
  return target.texture;
}
