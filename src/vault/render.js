// Contact shadows and the post-processing pipeline (with adaptive quality).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';
import { HeatHazeShader } from './effects.js';

/**
 * Soft contact shadows: objects are rendered top-down as silhouettes into a small target,
 * blurred, and laid on the slab. Cheap, soft and anchors everything to the surface.
 */
export class ContactShadows {
  constructor(renderer, { width, depth, y, resolution = 512, blur = 3.2, opacity = 0.85 }) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(resolution, resolution * depth / width);
    this.rtBlur = this.rt.clone();
    this.camera = new THREE.OrthographicCamera(-width / 2, width / 2, depth / 2, -depth / 2, 0, 1.2);
    this.camera.position.set(0, y + 1.2, 0);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, y, 0);
    this.blur = blur;
    this.silhouette = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.hBlur = new FullScreenQuad(new THREE.ShaderMaterial(HorizontalBlurShader));
    this.vBlur = new FullScreenQuad(new THREE.ShaderMaterial(VerticalBlurShader));
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: this.rtBlur.texture, transparent: true, opacity, depthWrite: false, toneMapped: false })
    );
    this.mesh.position.y = y + 0.0015;
    this.mesh.renderOrder = 1;
  }

  update(scene, casters) {
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevClear = r.getClearAlpha();
    const prevColor = r.getClearColor(new THREE.Color());
    const prevBg = scene.background;
    const prevOverride = scene.overrideMaterial;
    const visibility = new Map();
    scene.traverse((o) => { if (o.visible && (o.isMesh || o.isPoints || o.isSprite)) visibility.set(o, true); });
    visibility.forEach((_, o) => { o.visible = false; });
    casters.forEach((c) => c.traverse((o) => { if (visibility.has(o) && o.isMesh) o.visible = true; }));

    scene.background = null;
    scene.overrideMaterial = this.silhouette;
    r.setClearColor(0x000000, 0);
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(scene, this.camera);
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    visibility.forEach((_, o) => { o.visible = true; });

    // Two blur passes, ping-ponging between targets.
    for (let i = 0; i < 2; i++) {
      const spread = this.blur * (i + 1);
      this.hBlur.material.uniforms.tDiffuse.value = this.rt.texture;
      this.hBlur.material.uniforms.h.value = spread / this.rt.width;
      r.setRenderTarget(this.rtBlur);
      this.hBlur.render(r);
      this.vBlur.material.uniforms.tDiffuse.value = this.rtBlur.texture;
      this.vBlur.material.uniforms.v.value = spread / this.rt.height;
      r.setRenderTarget(this.rt);
      this.vBlur.render(r);
    }
    this.hBlur.material.uniforms.tDiffuse.value = this.rt.texture;
    this.hBlur.material.uniforms.h.value = 0.4 / this.rt.width;
    r.setRenderTarget(this.rtBlur);
    this.hBlur.render(r);

    r.setRenderTarget(prevTarget);
    r.setClearColor(prevColor, prevClear);
  }
}

export const QUALITY = {
  high: { pixelRatio: 2, ao: true, dof: true, haze: true },
  medium: { pixelRatio: 1.5, ao: false, dof: true, haze: true },
  low: { pixelRatio: 1, ao: false, dof: false, haze: false }
};

export class Pipeline {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.render = new RenderPass(scene, camera);
    this.ao = new GTAOPass(scene, camera, 2, 2);
    this.ao.output = GTAOPass.OUTPUT.Default;
    this.ao.blendIntensity = 0.85;
    this.ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1.2, scale: 1.1, samples: 12 });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.haze = new ShaderPass(HeatHazeShader);
    this.dof = new BokehPass(scene, camera, { focus: 5, aperture: 0.0016, maxblur: 0.008 });
    // High threshold: only genuinely hot things (molten metal, embers) bloom, not metal highlights.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.6, 0.45, 2.3);
    this.output = new OutputPass();
    this.smaa = new SMAAPass(2, 2);
    [this.render, this.ao, this.haze, this.dof, this.bloom, this.output, this.smaa].forEach((p) => this.composer.addPass(p));
    this.level = 'high';
  }

  setQuality(level, width, height) {
    const q = QUALITY[level];
    this.level = level;
    this.ao.enabled = q.ao;
    this.dof.enabled = q.dof;
    this.haze.enabled = q.haze;
    const pr = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.setSize(width, height);
  }

  setSize(w, h) {
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
  }
}
