// Procedural smithy surfaces: brick, wood, flagstone floor and hot-metal scale.
import * as THREE from 'three';
import { canvas, rng, paintNoise, heightToNormal, tex } from '../vault/textures.js';

function repeat(t, x, y) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(x, y);
  return t;
}

// Soot-stained brickwork with recessed mortar.
export function brickSurface({ w = 1024, h = 1024, seed = 11, rows = 16, cols = 6, repeatX = 1, repeatY = 1 } = {}) {
  const rand = rng(seed);
  const c = canvas(w, h), g = c.getContext('2d');
  const hc = canvas(w, h), hg = hc.getContext('2d');
  g.fillStyle = '#2a211c'; g.fillRect(0, 0, w, h);
  hg.fillStyle = 'rgb(60,60,60)'; hg.fillRect(0, 0, w, h);
  const bh = h / rows, bw = w / cols, m = Math.max(3, bh * 0.09);
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * bw / 2;
    for (let k = -1; k <= cols; k++) {
      const x = k * bw + off + m / 2, y = r * bh + m / 2;
      const v = 0.75 + rand() * 0.5;
      const red = Math.round(92 * v), gr = Math.round(46 * v), bl = Math.round(34 * v);
      g.fillStyle = `rgb(${red},${gr},${bl})`;
      g.fillRect(x, y, bw - m, bh - m);
      hg.fillStyle = `rgb(${170 + rand() * 40},${170},${170})`;
      hg.fillRect(x, y, bw - m, bh - m);
    }
  }
  // Grime and soot, darker toward the top (the hearth's smoke).
  g.globalCompositeOperation = 'multiply';
  paintNoise(g, w, h, rand, 5, 0.55);
  const soot = g.createLinearGradient(0, 0, 0, h);
  soot.addColorStop(0, 'rgba(0,0,0,0.75)'); soot.addColorStop(0.6, 'rgba(0,0,0,0.25)'); soot.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = soot; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  hg.globalCompositeOperation = 'overlay';
  paintNoise(hg, w, h, rand, 4, 0.4);
  return {
    map: repeat(tex(c, true), repeatX, repeatY),
    normalMap: repeat(tex(heightToNormal(hc, 2.5), false), repeatX, repeatY)
  };
}

// Worn end-grain / bark for the anvil stump and hammer handle.
export function woodSurface({ w = 512, h = 512, seed = 21 } = {}) {
  const rand = rng(seed);
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#3a2618'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {
    const x = rand() * w;
    g.strokeStyle = `rgba(${20 + rand() * 30},${12 + rand() * 18},${8 + rand() * 10},${0.25 + rand() * 0.4})`;
    g.lineWidth = 1 + rand() * 4;
    g.beginPath(); g.moveTo(x, 0);
    for (let y = 0; y <= h; y += 32) g.lineTo(x + Math.sin(y * 0.02 + i) * 6, y);
    g.stroke();
  }
  const hc = canvas(w, h), hg = hc.getContext('2d');
  hg.drawImage(c, 0, 0);
  return { map: tex(c, true), normalMap: tex(heightToNormal(hc, 1.6), false) };
}

// Dark flagstones for the floor.
export function floorSurface({ size = 1024, seed = 31 } = {}) {
  const rand = rng(seed);
  const c = canvas(size, size), g = c.getContext('2d');
  const hc = canvas(size, size), hg = hc.getContext('2d');
  g.fillStyle = '#121010'; g.fillRect(0, 0, size, size);
  hg.fillStyle = 'rgb(50,50,50)'; hg.fillRect(0, 0, size, size);
  const n = 4, s = size / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = 22 + rand() * 14;
    g.fillStyle = `rgb(${v},${v - 2},${v - 4})`;
    g.fillRect(x * s + 6, y * s + 6, s - 12, s - 12);
    hg.fillStyle = 'rgb(160,160,160)';
    hg.fillRect(x * s + 6, y * s + 6, s - 12, s - 12);
  }
  g.globalCompositeOperation = 'overlay';
  paintNoise(g, size, size, rand, 5, 0.5);
  return {
    map: repeat(tex(c, true), 3, 3),
    normalMap: repeat(tex(heightToNormal(hc, 2), false), 3, 3)
  };
}

/**
 * Hot steel: an emissive map of uneven heat with flaking scale, plus crack lines.
 * Cracks are dark seams in the glow (and in the colour), so they read on hot and cold metal.
 */
export function billetSurface({ cracks = 0, seed = 41 } = {}) {
  const rand = rng(seed);
  const w = 1024, h = 256;
  const glow = canvas(w, h), gg = glow.getContext('2d');
  gg.fillStyle = '#fff'; gg.fillRect(0, 0, w, h);
  gg.globalCompositeOperation = 'multiply';
  paintNoise(gg, w, h, rand, 5, 0.5);
  // Ends cool faster than the middle.
  const ends = gg.createLinearGradient(0, 0, w, 0);
  ends.addColorStop(0, 'rgba(90,90,90,1)'); ends.addColorStop(0.2, 'rgba(255,255,255,1)');
  ends.addColorStop(0.8, 'rgba(255,255,255,1)'); ends.addColorStop(1, 'rgba(90,90,90,1)');
  gg.fillStyle = ends; gg.fillRect(0, 0, w, h);
  gg.globalCompositeOperation = 'source-over';

  const color = canvas(w, h), cg = color.getContext('2d');
  cg.fillStyle = '#fff'; cg.fillRect(0, 0, w, h);
  cg.globalCompositeOperation = 'multiply';
  paintNoise(cg, w, h, rand, 4, 0.35);
  cg.globalCompositeOperation = 'source-over';

  const crackRand = rng(seed + 7);
  for (let i = 0; i < cracks; i++) {
    let x = w * (0.25 + 0.5 * crackRand()), y = 0;
    const pts = [[x, y]];
    while (y < h) { y += 18 + crackRand() * 26; x += (crackRand() - 0.5) * 60; pts.push([x, y]); }
    [[gg, 'rgba(0,0,0,0.95)', 7], [cg, 'rgba(10,8,8,0.9)', 5]].forEach(([g2, style, width]) => {
      g2.strokeStyle = style; g2.lineWidth = width; g2.lineJoin = 'round';
      g2.beginPath(); pts.forEach(([px, py], k) => (k ? g2.lineTo(px, py) : g2.moveTo(px, py))); g2.stroke();
    });
  }
  return { emissiveMap: tex(glow, true), map: tex(color, true) };
}
