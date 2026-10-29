// Ingot and mould geometry.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

export const INGOT = {
  length: 1.6,      // x
  height: 0.42,     // y
  depth: 0.82,      // z
  topScaleX: 0.86,  // the top face is smaller than the base, like real cast bullion
  topScaleZ: 0.76,
  radius: 0.055,
  dip: 0.014        // the top settles slightly as the metal cools
};

/**
 * A cast bar: rounded edges, tapered sides and a faintly sunken top.
 * Origin at the centre of the base, so it sits on y = 0.
 * Groups follow BoxGeometry order: +x, -x, +y (top), -y, +z (front), -z (back).
 */
export function ingotGeometry(opts = INGOT) {
  const { length: L, height: H, depth: D, topScaleX, topScaleZ, radius, dip } = opts;
  const g = new RoundedBoxGeometry(L, H, D, 8, radius);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const J = new THREE.Matrix3();
  const n = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = (y + H / 2) / H; // 0 at the base, 1 at the top
    const sx = 1 + (topScaleX - 1) * t, sz = 1 + (topScaleZ - 1) * t;
    const dsx = (topScaleX - 1) / H, dsz = (topScaleZ - 1) / H;

    let ny = y + H / 2;
    if (nor.getY(i) > 0.6) {
      const u = (x / (L / 2)), v = (z / (D / 2));
      ny -= dip * Math.max(0, (1 - u * u)) * Math.max(0, (1 - v * v));
    }
    pos.setXYZ(i, x * sx, ny, z * sz);

    // Normals transform by the inverse-transpose of the taper's Jacobian.
    J.set(sx, x * dsx, 0, 0, 1, 0, 0, z * dsz, sz).invert().transpose();
    n.set(nor.getX(i), nor.getY(i), nor.getZ(i)).applyMatrix3(J).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

export const MOULD = { length: 2.15, height: 0.52, depth: 1.25, cavityScale: 1.04 };

/**
 * A sand-cast mould: a rounded block with the ingot's own shape carved out, upside down
 * (an open mould is widest at the opening). Built with constructive solid geometry.
 */
export function mouldGeometry() {
  const block = new Brush(new RoundedBoxGeometry(MOULD.length, MOULD.height, MOULD.depth, 4, 0.07));
  block.position.y = MOULD.height / 2;
  block.updateMatrixWorld();

  const cavityGeo = ingotGeometry(Object.assign({}, INGOT, { dip: 0 }));
  cavityGeo.scale(MOULD.cavityScale, 1, MOULD.cavityScale);
  const cavity = new Brush(cavityGeo);
  cavity.rotation.x = Math.PI;                          // flip: wide face at the opening
  cavity.position.y = MOULD.height + 0.03;              // opening just above the block's top
  cavity.updateMatrixWorld();

  const evaluator = new Evaluator();
  evaluator.attributes = ['position', 'normal', 'uv'];
  evaluator.useGroups = false;
  const result = evaluator.evaluate(block, cavity, SUBTRACTION);
  const geo = result.geometry;
  geo.computeBoundingSphere();
  return geo;
}

// Depth of the cavity floor and the cross-section scale at a given fill level (0..1).
export function cavityAt(fill) {
  const floorY = MOULD.height + 0.03 - INGOT.height;     // the narrow end of the flipped ingot
  const level = floorY + 0.02 + fill * (INGOT.height - 0.09);
  // Height from the cavity floor, mapped back onto the ingot's taper (narrow at floor).
  const t = 1 - (level - floorY) / INGOT.height;
  const sx = (1 + (INGOT.topScaleX - 1) * t) * MOULD.cavityScale;
  const sz = (1 + (INGOT.topScaleZ - 1) * t) * MOULD.cavityScale;
  return { level, width: INGOT.length * sx, depth: INGOT.depth * sz };
}

export function roundedRectGeometry(w, d, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ShapeGeometry(s, 12);
  // Normalised UVs (0..1 across the rectangle) for the molten-metal shader.
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - x) / w, (p.getY(i) - y) / d);
  g.rotateX(-Math.PI / 2);
  return g;
}
