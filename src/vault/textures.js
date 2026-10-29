// Procedural surface textures, generated once on a canvas: no image files, so it works offline.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Seeded PRNG so every ingot of an alloy looks the same between visits.
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// Multi-octave value noise painted by upscaling random tiles with smoothing.
function paintNoise(g, w, h, rand, octaves, contrast) {
  const tmp = canvas(4, 4);
  const tg = tmp.getContext('2d');
  g.imageSmoothingEnabled = true;
  for (let o = 0; o < octaves; o++) {
    const cells = 4 << o;
    tmp.width = cells;
    tmp.height = Math.max(2, Math.round(cells * h / w));
    const img = tg.createImageData(tmp.width, tmp.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rand() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    tg.putImageData(img, 0, 0);
    g.globalAlpha = contrast / (o + 1);
    g.drawImage(tmp, 0, 0, w, h);
  }
  g.globalAlpha = 1;
}

// Height field (grey = 128) -> tangent-space normal map using a Sobel filter.
function heightToNormal(src, strength) {
  const w = src.width, h = src.height;
  const data = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = canvas(w, h);
  const og = out.getContext('2d');
  const img = og.createImageData(w, h);
  const H = (x, y) => data[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
      let nx = -dx * strength, ny = dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * w + x) * 4;
      img.data[i] = (nx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  return out;
}

function tex(c, color, anisotropy) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy || 8;
  t.needsUpdate = true;
  return t;
}

/**
 * One face of a cast metal bar: micro roughness variation, fine scratches and an optional
 * stamped inscription pressed into the surface.
 * Returns { map, roughnessMap, normalMap } for MeshPhysicalMaterial.
 */
export function metalFace({ w = 1024, h = 512, seed = 1, roughness = 0.2, lines = null, brushed = false, anisotropy = 8 }) {
  const rand = rng(seed);
  const height = canvas(w, h);
  const hg = height.getContext('2d');
  hg.fillStyle = 'rgb(128,128,128)';
  hg.fillRect(0, 0, w, h);

  const rough = canvas(w, h);
  const rg = rough.getContext('2d');
  const base = Math.round(roughness * 255);
  rg.fillStyle = `rgb(${base},${base},${base})`;
  rg.fillRect(0, 0, w, h);
  // Uneven polish: soft blotches of slightly rougher / smoother metal.
  rg.globalCompositeOperation = 'overlay';
  paintNoise(rg, w, h, rand, 4, 0.35);
  rg.globalCompositeOperation = 'source-over';

  // Fine scratches: long faint hairlines (brushed) or short random nicks (cast).
  const count = brushed ? 420 : 160;
  for (let i = 0; i < count; i++) {
    const x = rand() * w, y = rand() * h;
    const len = brushed ? 80 + rand() * 400 : 6 + rand() * 50;
    const ang = brushed ? (rand() - 0.5) * 0.04 : rand() * Math.PI;
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    hg.strokeStyle = `rgba(100,100,100,${0.15 + rand() * 0.3})`;
    hg.lineWidth = 0.6 + rand() * 0.8;
    hg.beginPath(); hg.moveTo(x, y); hg.lineTo(x2, y2); hg.stroke();
    rg.strokeStyle = `rgba(255,255,255,${0.04 + rand() * 0.08})`;
    rg.lineWidth = 1;
    rg.beginPath(); rg.moveTo(x, y); rg.lineTo(x2, y2); rg.stroke();
  }

  // Colour map stays white (the metal colour comes from the material) apart from the
  // inscription, whose cavities are slightly darker, like real stamped bullion.
  const color = canvas(w, h);
  const cg = color.getContext('2d');
  cg.fillStyle = '#fff';
  cg.fillRect(0, 0, w, h);

  if (lines) {
    const draw = (g, style, blur) => {
      g.save();
      g.fillStyle = style;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (blur) g.filter = `blur(${blur}px)`;
      let total = 0;
      lines.forEach((l) => { total += l.size * (l.lead || 1.25); });
      let y = h / 2 - total / 2;
      lines.forEach((l) => {
        const lh = l.size * (l.lead || 1.25);
        g.font = `${l.weight || 600} ${l.size}px ${l.font || '"Cinzel", "Trajan Pro", Georgia, "Times New Roman", serif'}`;
        if ('letterSpacing' in g) g.letterSpacing = (l.spacing || 0) + 'px';
        g.fillText(l.text, w / 2, y + lh / 2);
        y += lh;
      });
      g.restore();
    };
    // Pressed-in letters: a soft bevel (blurred) under a crisp floor.
    draw(hg, 'rgb(70,70,70)', 3);
    draw(hg, 'rgb(40,40,40)', 0);
    draw(rg, `rgb(${Math.min(255, base + 70)},${Math.min(255, base + 70)},${Math.min(255, base + 70)})`, 1);
    draw(cg, 'rgb(150,150,150)', 2);
  }

  return {
    map: tex(color, true, anisotropy),
    roughnessMap: tex(rough, false, anisotropy),
    normalMap: tex(heightToNormal(height, 2.2), false, anisotropy)
  };
}

// Grainy sand-cast mould surface.
export function sandSurface({ size = 512, seed = 7 }) {
  const rand = rng(seed);
  const c = canvas(size, size);
  const g = c.getContext('2d');
  g.fillStyle = '#3d3d40';
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'multiply';
  paintNoise(g, size, size, rand, 5, 0.45);
  g.globalCompositeOperation = 'source-over';
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const grain = (rand() - 0.5) * 38;
    img.data[i] += grain; img.data[i + 1] += grain; img.data[i + 2] += grain;
  }
  g.putImageData(img, 0, 0);

  const hgt = canvas(size, size);
  const hg = hgt.getContext('2d');
  const himg = hg.createImageData(size, size);
  for (let i = 0; i < himg.data.length; i += 4) {
    const v = 128 + (rand() - 0.5) * 90;
    himg.data[i] = himg.data[i + 1] = himg.data[i + 2] = v;
    himg.data[i + 3] = 255;
  }
  hg.putImageData(himg, 0, 0);

  const map = tex(c, true);
  const normalMap = tex(heightToNormal(hgt, 1.4), false);
  [map, normalMap].forEach((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); });
  return { map, normalMap };
}

// Polished black granite with faint mineral speckles.
export function graniteSurface({ w = 2048, h = 512, seed = 3 }) {
  const rand = rng(seed);
  const c = canvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#0c0c0e';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    const v = 20 + rand() * 40;
    g.fillStyle = `rgba(${v},${v},${v + 4},${0.4 + rand() * 0.5})`;
    g.fillRect(rand() * w, rand() * h, 1 + rand() * 2.5, 1 + rand() * 2.5);
  }
  const rough = canvas(w / 2, h / 2);
  const rg = rough.getContext('2d');
  rg.fillStyle = 'rgb(40,40,40)';
  rg.fillRect(0, 0, w / 2, h / 2);
  rg.globalCompositeOperation = 'lighter';
  paintNoise(rg, w / 2, h / 2, rand, 4, 0.18);
  return { map: tex(c, true), roughnessMap: tex(rough, false) };
}

// Soft-edged rectangle used for the virtual softboxes in the studio environment.
export function softboxTexture() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(0.65, '#f4f4f4');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return tex(c, true);
}

export function radialTexture(stops) {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([o, col]) => grad.addColorStop(o, col));
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return tex(c, true);
}
