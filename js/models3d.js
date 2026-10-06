// Auld World - procedural low-poly models for the 3D view (buildings, villages, units, trees, ore, props).
// Everything is built from boxes, cones and cylinders baked into a few merged geometries, so a whole town costs a handful of draw calls.
// Colours: a hex string is a fixed colour; 'P' / 'A' take the owning house's primary / accent; 'S' spins (mill sails).
// To use hand-made glTF models later, replace the builder for a kind in BUILD / UNIT with a loader that returns the same { group } shape.
import * as THREE from '../vendor/three.module.js';
import { HOUSES } from './config.js';

const { BufferGeometry, Float32BufferAttribute, Matrix4, Quaternion, Vector3, Euler, Color, Group, Mesh, MeshLambertMaterial } = THREE;
const _c = new Color();
const rgb = (hex) => { _c.set(hex); return [_c.r, _c.g, _c.b]; };

// ---- part helpers (y is the BOTTOM of the shape; units are tiles)
const M = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(rx, ry, rz)), new Vector3(sx, sy, sz));
export const box = (w, h, d, x, y, z, c, ry = 0) => ({ g: new THREE.BoxGeometry(w, h, d), m: M(x, y + h / 2, z, ry), c });
export const cyl = (r, h, x, y, z, c, seg = 10, rt = r) => ({ g: new THREE.CylinderGeometry(rt, r, h, seg), m: M(x, y + h / 2, z), c });
export const cone = (r, h, x, y, z, c, seg = 8) => ({ g: new THREE.ConeGeometry(r, h, seg), m: M(x, y + h / 2, z), c });
export const ball = (r, x, y, z, c, sy = 1, seg = 8) => ({ g: new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)), m: M(x, y + r * sy, z, 0, 1, sy, 1), c });
export const pyramid = (w, d, h, x, y, z, c) => ({ g: new THREE.ConeGeometry(0.7071, 1, 4), m: M(x, y + h / 2, z, Math.PI / 4, w, h, d), c });
export const dome = (r, x, y, z, c) => ({ g: new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m: M(x, y, z), c });
// gable roof: ridge runs along z (rotate with ry), eaves overhang a little
const gableGeo = (() => {
  const g = new BufferGeometry(), a = [-0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5, -0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5];
  const I = [0, 1, 2, 3, 5, 4, 0, 2, 5, 0, 5, 3, 1, 4, 5, 1, 5, 2, 0, 3, 4, 0, 4, 1];
  g.setAttribute('position', new Float32BufferAttribute(I.flatMap((i) => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]]), 3)); g.computeVertexNormals(); return g;
})();
export const gable = (w, d, h, x, y, z, c, ry = 0) => ({ g: gableGeo, m: M(x, y, z, ry, w, h, d), c });
export const shift = (parts, dx, dz, s = 1, ry = 0) => parts.map((p) => ({ ...p, m: new Matrix4().multiplyMatrices(M(dx, 0, dz, ry, s, s, s), p.m) }));

// bake parts into { f: fixed-colour geometry, P, A, S } (non-indexed, flat shaded)
export function bake(parts) {
  const out = { f: { p: [], n: [], c: [] }, P: { p: [], n: [] }, A: { p: [], n: [] }, S: { p: [], n: [], c: [] } };
  const v = new Vector3(), nm = new THREE.Matrix3();
  for (const part of parts) {
    const geo = part.g.index ? part.g.toNonIndexed() : part.g.clone();
    geo.applyMatrix4(part.m);
    const key = part.c === 'P' ? 'P' : part.c === 'A' ? 'A' : part.c === 'S' ? 'S' : 'f';
    const o = out[key], pos = geo.attributes.position, nor = geo.attributes.normal;
    const col = key === 'f' ? rgb(part.c) : key === 'S' ? rgb(part.col || '#c9b48a') : null;
    for (let i = 0; i < pos.count; i++) {
      o.p.push(pos.getX(i), pos.getY(i), pos.getZ(i)); o.n.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      if (col) o.c.push(col[0], col[1], col[2]);
    }
    geo.dispose();
  }
  const mk = (o) => { if (!o.p.length) return null; const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(o.p, 3)); g.setAttribute('normal', new Float32BufferAttribute(o.n, 3)); if (o.c && o.c.length) g.setAttribute('color', new Float32BufferAttribute(o.c, 3)); g.computeBoundingSphere(); return g; };
  return { f: mk(out.f), P: mk(out.P), A: mk(out.A), S: mk(out.S) };
}

// ---- materials shared by everything
const matFixed = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
const teamMats = new Map();
const teamMat = (team, slot) => {
  const k = team + slot; let m = teamMats.get(k);
  if (!m) { const h = HOUSES[team]; m = new MeshLambertMaterial({ color: team >= 0 && h ? (slot === 'P' ? h.primary : h.accent) : slot === 'P' ? '#b9a98a' : '#e6dcc0', flatShading: true }); teamMats.set(k, m); }
  return m;
};
// a Group from baked geometry for one team
export function assemble(baked, team, shadows = true) {
  const g = new Group();
  const add = (geo, mat) => { if (!geo) return null; const m = new Mesh(geo, mat); m.castShadow = shadows; m.receiveShadow = true; g.add(m); return m; };
  add(baked.f, matFixed); add(baked.P, teamMat(team, 'P')); add(baked.A, teamMat(team, 'A'));
  if (baked.S) { const hub = new Group(); hub.position.set(...(baked.hub || [0, 0, 0])); const m = add(baked.S, matFixed); if (m) { g.remove(m); hub.add(m); g.add(hub); g.userData.spin = hub; } }
  return g;
}

// ---- colours
const STONE = '#9a968c', STONE2 = '#b3ad9f', DARK = '#4a4036', WOOD = '#8a5e34', WOOD2 = '#a97b48', THATCH = '#c2a45a', PLASTER = '#e4d8b8', ROOF = '#7a3b2a', ROOF2 = '#5b4a3a', DOOR = '#4a2f1a', IRON = '#55595e', GOLD = '#e0b83a', CROP = '#c5b24a', GRASSD = '#4b7a3c';

const door = (x, z, w = 0.3, h = 0.5, ry = 0) => box(w, h, 0.06, x, 0, z, DOOR, ry);
function cottageParts(s = 1, tone = PLASTER, roof = THATCH) { return [box(1.3, 0.7, 1.1, 0, 0, 0, tone), gable(1.55, 1.3, 0.62, 0, 0.7, 0, roof, 0), door(0.2, 0.56), box(0.25, 0.5, 0.25, 0.4, 0.9, -0.2, STONE), box(0.2, 0.2, 0.06, -0.3, 0.4, 0.56, '#6d8fb0')].map((p) => p); }

export const BUILD = {
  keep: () => {
    const p = [box(3.2, 1.7, 3.2, 0, 0, 0, STONE), box(1.5, 1.5, 1.5, 0, 1.7, 0, STONE2), pyramid(1.7, 1.7, 0.9, 0, 3.2, 0, 'P'), box(0.7, 0.9, 0.08, 0, 0, 1.62, DOOR), box(0.9, 0.2, 0.1, 0, 1.0, 1.62, 'A')];
    for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) p.push(cyl(0.5, 2.5, x, 0, z, STONE2, 10), cone(0.62, 0.8, x, 2.5, z, 'P', 10));
    for (let i = -3; i <= 3; i++) { p.push(box(0.28, 0.25, 0.28, i * 0.45, 1.7, 1.55, STONE2), box(0.28, 0.25, 0.28, i * 0.45, 1.7, -1.55, STONE2)); }
    return p;
  },
  cottage: () => [...cottageParts(), box(0.16, 0.5, 0.16, 0.55, 0.2, 0.62, 'A')],
  farm: () => {
    const p = [box(2.7, 0.06, 2.7, 0, 0, 0, '#6b4a2a')];
    for (let i = -4; i <= 4; i++) p.push(box(0.2, 0.18, 2.4, i * 0.3, 0.06, 0, i % 2 ? CROP : '#a7a63e'));
    p.push(...shift([box(0.9, 0.55, 0.7, 0, 0, 0, '#9a3f2e'), gable(1.05, 0.9, 0.4, 0, 0.55, 0, '#5b4a3a', 0)], 0.9, -1.0));
    p.push(box(0.1, 0.5, 0.1, -1.2, 0.06, 1.1, '#8a6a3a'), cone(0.2, 0.4, -1.2, 0.5, 1.1, '#d8c070'));
    return p;
  },
  mill: () => ({
    parts: [cyl(0.8, 1.4, 0, 0, 0, PLASTER, 10, 0.55), cone(0.7, 0.7, 0, 1.4, 0, ROOF2, 10), box(0.22, 0.4, 0.06, 0, 0, 0.78, DOOR), box(0.4, 0.4, 0.4, 0, 0, 0, PLASTER)],
    spin: { hub: [0, 1.1, 0.7], parts: [box(0.14, 2.1, 0.06, 0, -1.05, 0, 'S'), { g: new THREE.BoxGeometry(2.1, 0.14, 0.06), m: M(0, 0, 0), c: 'S' }, { g: new THREE.BoxGeometry(0.5, 0.9, 0.04), m: M(0.0, 0.7, 0.04), c: 'S', col: '#e8dcc0' }, { g: new THREE.BoxGeometry(0.9, 0.5, 0.04), m: M(0.7, 0.0, 0.04), c: 'S', col: '#e8dcc0' }, { g: new THREE.BoxGeometry(0.5, 0.9, 0.04), m: M(0.0, -0.7, 0.04), c: 'S', col: '#e8dcc0' }, { g: new THREE.BoxGeometry(0.9, 0.5, 0.04), m: M(-0.7, 0.0, 0.04), c: 'S', col: '#e8dcc0' }] },
  }),
  warehouse: () => [box(2.5, 1.0, 1.7, 0, 0, 0, WOOD), gable(2.7, 1.9, 0.7, 0, 1.0, 0, ROOF2, 0), box(0.9, 0.8, 0.06, 0, 0, 0.87, DOOR), box(0.4, 0.4, 0.4, 1.2, 0, 1.15, WOOD2), box(0.4, 0.4, 0.4, 1.3, 0, 1.55, WOOD2), cyl(0.2, 0.4, -1.2, 0, 1.2, '#6a4a28')],
  market: () => {
    const p = [box(0.15, 0.7, 0.15, 0, 0, 0, STONE2), cyl(0.3, 0.3, 0, 0, 0, STONE)];
    [[-0.9, -0.9, 'P'], [0.9, -0.9, 'A'], [-0.9, 0.9, 'A'], [0.9, 0.9, 'P']].forEach(([x, z, c]) => p.push(box(0.8, 0.45, 0.5, x, 0, z, WOOD), pyramid(1.0, 0.9, 0.35, x, 0.95, z, c), box(0.06, 0.5, 0.06, x - 0.4, 0.45, z + 0.28, WOOD2), box(0.06, 0.5, 0.06, x + 0.4, 0.45, z + 0.28, WOOD2), box(0.2, 0.15, 0.2, x - 0.15, 0.45, z, '#c0603a'), box(0.2, 0.15, 0.2, x + 0.15, 0.45, z, '#d6b04a')));
    return p;
  },
  forge: () => [box(2.0, 0.9, 1.6, 0, 0, 0, STONE), gable(2.2, 1.8, 0.6, 0, 0.9, 0, '#3c3a3a', 0), cyl(0.2, 1.7, 0.7, 0.6, -0.4, STONE2, 8, 0.15), box(0.5, 0.3, 0.06, 0, 0.1, 0.82, '#e2742a'), box(0.4, 0.2, 0.3, -0.8, 0, 1.0, IRON), box(0.3, 0.1, 0.5, 0.8, 0, 1.1, IRON), box(0.7, 0.7, 0.06, 0, 0, 0.82, '#2c2420')],
  foundry: () => [box(2.2, 1.0, 1.9, 0, 0, 0, '#7b7468'), gable(2.4, 2.1, 0.55, 0, 1.0, 0, '#34302c', 0), cyl(0.22, 1.9, -0.7, 0.6, -0.5, STONE, 8, 0.16), cyl(0.22, 1.5, 0.5, 0.6, -0.6, STONE, 8, 0.16), box(0.8, 0.8, 0.06, 0, 0, 0.96, '#2c2420'), box(0.6, 0.3, 0.06, 0, 0.1, 0.97, '#e2742a')],
  workshop: () => [box(2.1, 0.9, 1.7, 0, 0, 0, '#a98a5a'), gable(2.3, 1.9, 0.6, 0, 0.9, 0, ROOF, 0), box(0.5, 0.7, 0.06, 0.4, 0, 0.87, DOOR), cyl(0.3, 0.1, -0.7, 0.3, 1.0, IRON, 10), box(0.9, 0.12, 0.6, -0.8, 0.25, 1.0, WOOD2), box(0.5, 0.2, 0.2, 0.9, 0, 1.1, WOOD2)],
  tavern: () => [box(1.4, 1.0, 1.2, 0, 0, 0, '#d8c8a0'), box(1.5, 0.08, 1.3, 0, 0.55, 0, WOOD), gable(1.7, 1.45, 0.7, 0, 1.0, 0, ROOF, 0), door(0, 0.62, 0.34, 0.6), box(0.2, 0.3, 0.06, -0.45, 0.5, 0.62, '#6d8fb0'), box(0.6, 0.35, 0.05, 0.6, 0.75, 0.62, 'A'), box(0.04, 0.4, 0.04, 0.35, 0.6, 0.66, WOOD), box(0.2, 0.6, 0.2, -0.5, 1.2, -0.3, STONE)],
  academy: () => {
    const p = [box(2.5, 0.9, 2.0, 0, 0, 0, STONE2), box(1.6, 0.8, 1.4, 0, 0.9, 0, PLASTER), dome(0.7, 0, 1.7, 0, 'P'), cone(0.07, 0.4, 0, 2.4, 0, GOLD, 5), box(0.5, 0.6, 0.06, 0, 0, 1.01, DOOR)];
    for (let i = -2; i <= 2; i++) p.push(cyl(0.09, 0.8, i * 0.5, 0, 1.12, '#f0ead8', 8));
    return p;
  },
  temple: () => {
    const p = [box(1.5, 0.15, 1.7, 0, 0, 0, STONE2), box(1.1, 0.8, 1.4, 0, 0.15, -0.1, PLASTER), gable(1.4, 1.7, 0.6, 0, 0.95, -0.1, ROOF2, 0), door(0, 0.62, 0.3, 0.55), box(0.06, 0.55, 0.06, 0, 1.55, -0.1, GOLD), box(0.3, 0.06, 0.06, 0, 1.9, -0.1, GOLD), cyl(0.25, 0.6, 0.6, 0.15, 0.8, STONE2, 6)];
    for (const x of [-0.5, 0.5]) p.push(cyl(0.08, 0.7, x, 0.15, 0.7, '#f0ead8', 8));
    return p;
  },
  barracks: () => [box(2.4, 0.95, 1.7, 0, 0, 0, '#8d7a5c'), gable(2.6, 1.9, 0.7, 0, 0.95, 0, 'P', 0), box(0.6, 0.7, 0.06, 0, 0, 0.87, DOOR), box(0.06, 1.3, 0.06, 1.1, 0.95, 0.7, WOOD), box(0.4, 0.28, 0.03, 1.3, 1.9, 0.7, 'P'), box(0.08, 0.7, 0.3, -1.0, 0.1, 1.0, IRON), box(0.4, 0.5, 0.08, -0.8, 0.25, 0.95, 'A')],
  archery: () => {
    const p = [];
    for (const x of [-1.1, 1.1]) for (const z of [-0.8, 0.8]) p.push(box(0.12, 1.0, 0.12, x, 0, z, WOOD));
    p.push(gable(2.5, 1.9, 0.5, 0, 1.0, 0, ROOF2, 0), box(2.3, 0.08, 1.7, 0, 0, 0, '#7e6a3c'), box(2.2, 0.5, 0.06, 0, 0.1, -0.85, WOOD2));
    for (const x of [-0.9, 0, 0.9]) p.push(cyl(0.3, 0.08, x, 0.35, -1.3, 'A', 12), cyl(0.15, 0.1, x, 0.35, -1.3, '#e8dcc0', 12), box(0.06, 0.6, 0.06, x, 0, -1.3, WOOD));
    return p;
  },
  stable: () => {
    const p = [box(2.4, 0.8, 1.4, 0, 0, -0.2, '#9a6a3c'), gable(2.7, 1.9, 0.65, 0, 0.8, -0.1, ROOF2, 0), box(0.8, 0.7, 0.06, 0, 0, 0.51, DOOR), box(0.4, 0.4, 0.3, 1.0, 0, 0.9, '#d8c070')];
    for (let i = -4; i <= 4; i++) p.push(box(0.05, 0.4, 0.05, i * 0.28, 0, 1.25, WOOD2));
    p.push(box(2.4, 0.06, 0.05, 0, 0.3, 1.25, WOOD2), box(0.05, 1.0, 0.05, -1.1, 0.8, 0.52, WOOD), box(0.3, 0.2, 0.03, -1.0, 1.4, 0.52, 'P'));
    return p;
  },
  tower: () => [cyl(0.62, 2.4, 0, 0, 0, STONE, 10, 0.5), cyl(0.72, 0.35, 0, 2.4, 0, STONE2, 10), cone(0.7, 0.8, 0, 2.75, 0, 'P', 10), box(0.3, 0.5, 0.06, 0, 0, 0.6, DOOR), box(0.1, 0.4, 0.06, 0, 1.4, 0.52, '#222'), box(0.1, 0.4, 0.06, 0.52, 1.4, 0, '#222')],
  mine: () => [cone(0.95, 1.1, 0, 0, -0.1, '#7d776c', 7), cone(0.6, 0.8, -0.5, 0, 0.3, '#8d877b', 6), box(0.1, 0.75, 0.1, -0.35, 0, 0.75, WOOD), box(0.1, 0.75, 0.1, 0.35, 0, 0.75, WOOD), box(0.9, 0.1, 0.12, 0, 0.7, 0.75, WOOD), box(0.55, 0.55, 0.05, 0, 0, 0.7, '#14100c'), box(0.3, 0.2, 0.2, 0.6, 0, 1.1, IRON), cone(0.2, 0.25, -0.7, 0, 1.0, '#6b6860', 5)],
  village: () => [...shift(cottageParts(), -0.6, -0.5, 1), ...shift(cottageParts(1, '#d4c4a0'), 0.7, -0.4, 0.95, 0.4), ...shift(cottageParts(1, '#e0d0aa', '#a58a4a'), -0.1, 0.9, 1.0, -0.3), cyl(0.2, 0.3, 0.9, 0, 0.9, STONE, 8), box(0.04, 0.55, 0.04, 0.9, 0.3, 0.9, WOOD)],
};
// per-kind footprint-relative scale of the model (models are drawn for a size-3 footprint centred on the middle of the lot)
export const BSCALE = { keep: 1.02 / 1, cottage: 1.15, farm: 1.0, mill: 1.1, warehouse: 1.0, market: 1.0, forge: 1.05, foundry: 1.0, workshop: 1.0, tavern: 1.2, academy: 1.0, temple: 1.2, barracks: 1.0, archery: 1.0, stable: 1.0, tower: 1.1, mine: 1.3, village: 1.0 };
const cacheB = new Map();
export function buildingModel(kind, team) {
  const k = kind + ':' + team; let ent = cacheB.get(kind);
  if (!ent) {
    const r = (BUILD[kind] || BUILD.cottage)(); const parts = Array.isArray(r) ? r : r.parts;
    ent = { baked: bake(parts), spin: r.spin ? bake(r.spin.parts) : null, hub: r.spin?.hub }; if (ent.spin) ent.baked.S = ent.spin.S; if (ent.baked.S) ent.baked.hub = ent.hub;
    cacheB.set(kind, ent);
  }
  void k; return assemble(ent.baked, team);
}

// ---- villages: a cluster of cottages plus a landmark for the kind, with the owner's flag
export function villageModel(kind, team, size) {
  const k = 'v:' + kind; let b = cacheB.get(k);
  if (!b) {
    const c = (tone, roof) => cottageParts(1, tone, roof);
    let p = [...shift(c(PLASTER), -0.9, -0.8), ...shift(c('#d4c4a0'), 0.9, -0.7, 0.95, 0.4), ...shift(c('#e0d0aa', '#a58a4a'), -0.8, 0.9, 1, -0.3)];
    if (kind === 'hamlet') p.push(...shift(c('#d8c8a4'), 1.0, 0.9, 0.9, 0.2), cyl(0.22, 0.3, 0.1, 0, 0.1, STONE, 8), box(0.04, 0.6, 0.04, 0.1, 0.3, 0.1, WOOD));
    else if (kind === 'market') p.push(...shift(BUILD.market(), 0.5, 0.4, 0.8));
    else if (kind === 'mine') p.push(...shift(BUILD.mine(), 0.8, 0.5, 1.1));
    else if (kind === 'hillfort') { p = [box(0, 0, 0, 0, 0, 0, '#000'), ...shift(BUILD.keep(), 0, 0, 0.6)]; for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; p.push(cyl(0.12, 0.9, Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2, WOOD, 5, 0.06)); } }
    else if (kind === 'abbey') p.push(...shift(BUILD.temple(), 0.6, 0.5, 1.2));
    else if (kind === 'inn') p.push(...shift(BUILD.tavern(), 0.6, 0.4, 1.3), ...shift(BUILD.stable(), -0.8, 1.3, 0.55));
    b = bake(p); cacheB.set(k, b);
  }
  const g = assemble(b, team);
  const pole = new Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 5), matFixed.clone()); pole.material.vertexColors = false; pole.material.color.set('#4a3a2a'); pole.position.set(size * 0.32, 0.8, size * 0.32); g.add(pole);
  const flag = new Mesh(new THREE.BoxGeometry(0.6, 0.38, 0.03), teamMat(team, 'P')); flag.position.set(size * 0.32 + 0.32, 1.35, size * 0.32); g.add(flag); g.userData.flag = flag;
  return g;
}

// ---- units
const SKIN = '#e0b58f';
function leg(x, hipY, len, c, w = 0.12) { const g = new THREE.BoxGeometry(w, len, w); g.translate(0, -len / 2, 0); return { g, m: M(x, hipY, 0), c, hip: [x, hipY, 0] }; }
const U = {
  recruit: () => ({ body: [box(0.32, 0.38, 0.2, 0, 0.42, 0, 'P'), ball(0.13, 0, 0.82, 0, SKIN), cyl(0.15, 0.08, 0, 0.9, 0, '#6a4a2a', 8), box(0.03, 0.8, 0.03, 0.26, 0.1, 0.1, '#7a5a30')], legs: [leg(-0.08, 0.44, 0.44, '#5a4a3a'), leg(0.08, 0.44, 0.44, '#5a4a3a')], arm: [box(0.05, 0.45, 0.05, 0, -0.4, 0, '#6a6a6a')], armAt: [0.2, 0.76, 0] }),
  serf: () => ({ body: [box(0.3, 0.36, 0.2, 0, 0.4, 0, '#8a6a42'), ball(0.13, 0, 0.8, 0, SKIN), cone(0.24, 0.12, 0, 0.9, 0, '#d8bd6a', 10), box(0.3, 0.06, 0.2, 0, 0.5, 0, '#5a4028')], legs: [leg(-0.08, 0.42, 0.42, '#4a3a2a'), leg(0.08, 0.42, 0.42, '#4a3a2a')], arm: [box(0.04, 0.5, 0.04, 0, -0.35, 0.05, '#7a5a30'), box(0.16, 0.05, 0.03, 0, -0.62, 0.05, '#8a8a8a')], armAt: [0.2, 0.72, 0] }),
  scout: () => ({ body: [box(0.3, 0.42, 0.2, 0, 0.4, 0, '#4f6f3a'), cone(0.19, 0.5, 0, 0.4, -0.04, '#44613a', 6), ball(0.12, 0, 0.8, 0.02, SKIN), cone(0.17, 0.26, 0, 0.88, 0.0, '#44613a', 6), box(0.04, 0.4, 0.04, -0.2, 0.5, -0.12, '#6a4a2a')], legs: [leg(-0.08, 0.42, 0.42, '#3a3a2a'), leg(0.08, 0.42, 0.42, '#3a3a2a')], arm: [box(0.03, 0.4, 0.03, 0, -0.3, 0, '#7a7a7a')], armAt: [0.2, 0.7, 0] }),
  footman: () => ({ body: [box(0.34, 0.4, 0.22, 0, 0.42, 0, 'P'), box(0.35, 0.1, 0.23, 0, 0.42, 0, '#777b80'), ball(0.13, 0, 0.84, 0, SKIN), cyl(0.15, 0.14, 0, 0.88, 0, '#9aa0a6', 8, 0.12), cyl(0.2, 0.05, -0.23, 0.45, 0.02, 'A', 10), box(0.04, 0.03, 0.04, -0.23, 0.5, 0.05, GOLD)], legs: [leg(-0.09, 0.44, 0.44, '#555a60'), leg(0.09, 0.44, 0.44, '#555a60')], arm: [box(0.04, 0.55, 0.02, 0, -0.45, 0.04, '#cfd3d8'), box(0.14, 0.04, 0.04, 0, -0.18, 0.04, '#6a4a2a')], armAt: [0.22, 0.74, 0] }),
  bowman: () => ({ body: [box(0.3, 0.4, 0.2, 0, 0.42, 0, 'P'), ball(0.12, 0, 0.82, 0, SKIN), cone(0.17, 0.22, 0, 0.88, 0, '#4a5f34', 6), box(0.08, 0.3, 0.06, 0.1, 0.45, -0.14, '#6a4a2a')], legs: [leg(-0.08, 0.44, 0.44, '#4a4a32'), leg(0.08, 0.44, 0.44, '#4a4a32')], arm: [{ g: new THREE.TorusGeometry(0.28, 0.018, 4, 10, Math.PI), m: M(0.04, -0.1, 0.04, 0, 1, 1, 1, 0, Math.PI / 2 + 0), c: '#7a5a30' }], armAt: [0.2, 0.74, 0.1] }),
  spy: () => ({ body: [box(0.3, 0.46, 0.2, 0, 0.38, 0, '#2c2c34'), cone(0.2, 0.5, 0, 0.3, 0, '#26262e', 6), ball(0.12, 0, 0.82, 0, SKIN), cyl(0.2, 0.03, 0, 0.9, 0, '#222', 10), cyl(0.12, 0.14, 0, 0.9, 0, '#222', 8), box(0.3, 0.06, 0.02, 0, 0.84, 0.11, '#111')], legs: [leg(-0.08, 0.4, 0.4, '#222'), leg(0.08, 0.4, 0.4, '#222')], arm: [box(0.03, 0.3, 0.03, 0, -0.2, 0, '#aaa')], armAt: [0.2, 0.7, 0] }),
  scholar: () => ({ body: [cyl(0.2, 0.55, 0, 0.12, 0, 'P', 8, 0.15), ball(0.12, 0, 0.84, 0, SKIN), cone(0.15, 0.3, 0, 0.9, 0, 'A', 6), box(0.16, 0.2, 0.05, 0.14, 0.52, 0.12, '#5a3a22')], legs: [leg(-0.07, 0.15, 0.15, '#2a2a2a'), leg(0.07, 0.15, 0.15, '#2a2a2a')], arm: [box(0.03, 0.4, 0.03, 0, -0.3, 0, '#8a6a3a'), ball(0.05, 0, -0.52, 0, '#d8c070')], armAt: [0.2, 0.7, 0] }),
  king: () => ({ body: [cyl(0.24, 0.6, 0, 0.1, 0, 'P', 8, 0.17), box(0.36, 0.1, 0.06, 0, 0.55, 0, '#f0ead8'), box(0.38, 0.6, 0.04, 0, 0.1, -0.15, 'A'), ball(0.13, 0, 0.88, 0, SKIN), cyl(0.12, 0.1, 0, 0.99, 0, GOLD, 5, 0.15), ...[0, 1, 2, 3, 4].map((i) => cone(0.025, 0.06, Math.cos(i * 1.256) * 0.12, 1.08, Math.sin(i * 1.256) * 0.12, GOLD, 4))], legs: [leg(-0.07, 0.15, 0.15, '#3a2a1a'), leg(0.07, 0.15, 0.15, '#3a2a1a')], arm: [box(0.035, 0.7, 0.035, 0, -0.5, 0, GOLD), ball(0.07, 0, -0.14, 0, 'P')], armAt: [0.25, 0.75, 0.05], scale: 1.25 }),
  knight: () => ({
    body: [box(0.55, 0.3, 0.9, 0, 0.5, 0, '#8a5a34'), box(0.3, 0.4, 0.3, 0, 0.62, 0.42, '#8a5a34'), box(0.2, 0.2, 0.34, 0, 0.9, 0.62, '#7a4c2c'), box(0.58, 0.04, 0.5, 0, 0.8, -0.02, 'A'), box(0.06, 0.2, 0.05, 0, 0.95, 0.38, '#2a1a0c'),
      box(0.3, 0.4, 0.22, 0, 0.82, -0.05, 'P'), box(0.31, 0.1, 0.23, 0, 0.9, -0.05, '#8a8e94'), ball(0.13, 0, 1.28, -0.05, SKIN), cyl(0.15, 0.15, 0, 1.32, -0.05, '#aeb3b9', 8, 0.12), box(0.04, 0.14, 0.04, 0, 1.46, -0.05, 'A'), cyl(0.18, 0.05, -0.26, 0.9, -0.05, 'A', 10), box(0.04, 0.04, 0.04, -0.26, 0.95, 0.0, GOLD)],
    legs: [leg(-0.2, 0.55, 0.55, '#6a4426', 0.1), { ...leg(0.2, 0.55, 0.55, '#6a4426', 0.1), hip: [0.2, 0.55, 0] }, { ...leg(-0.2, 0.55, 0.55, '#6a4426', 0.1), m: M(-0.2, 0.55, 0.35), hip: [-0.2, 0.55, 0.35] }, { ...leg(0.2, 0.55, 0.55, '#6a4426', 0.1), m: M(0.2, 0.55, 0.35), hip: [0.2, 0.55, 0.35] }].map((l, i) => (i < 2 ? { ...l, m: M(l.hip[0], 0.55, -0.35), hip: [l.hip[0], 0.55, -0.35] } : l)),
    arm: [box(0.04, 1.1, 0.04, 0, -0.1, 0.55, '#7a5a30'), cone(0.05, 0.25, 0, 0.0, 1.12, '#cfd3d8', 4).m && { g: new THREE.ConeGeometry(0.05, 0.25, 4), m: M(0, 0, 1.2, 0, 1, 1, 1, Math.PI / 2), c: '#cfd3d8' }], armAt: [0.24, 0.95, 0], scale: 1.0, noSwing: true,
  }),
  camel: () => ({ body: [box(0.55, 0.45, 1.1, 0, 0.62, 0, '#c4a06a'), ball(0.2, 0, 1.05, -0.1, '#b8935c', 1.2), ball(0.18, 0, 1.0, 0.25, '#b8935c', 1.2), box(0.16, 0.55, 0.16, 0, 1.0, 0.62, '#c4a06a'), box(0.2, 0.2, 0.34, 0, 1.5, 0.72, '#b8935c'), box(0.5, 0.06, 0.6, 0, 0.98, 0.1, 'P'), box(0.52, 0.2, 0.3, 0, 1.05, 0.1, 'A')], legs: [-1, 1].flatMap((sx) => [-0.4, 0.4].map((z) => ({ ...leg(sx * 0.2, 0.7, 0.7, '#a98550', 0.11), m: M(sx * 0.2, 0.7, z), hip: [sx * 0.2, 0.7, z] }))), arm: [], armAt: [0, 0, 0], scale: 1.0 }),
  ram: () => ({ body: [box(0.7, 0.08, 1.5, 0, 0.3, 0, WOOD), cyl(0.12, 1.4, 0, 0.62, 0, '#6a4a28', 8).m && { g: new THREE.CylinderGeometry(0.12, 0.12, 1.5, 8), m: M(0, 0.6, 0.1, 0, 1, 1, 1, Math.PI / 2), c: '#6a4a28' }, { g: new THREE.ConeGeometry(0.14, 0.3, 6), m: M(0, 0.6, 0.95, 0, 1, 1, 1, Math.PI / 2), c: IRON }, box(0.7, 0.05, 1.2, 0, 0.95, 0, 'P'), gable(0.8, 1.3, 0.3, 0, 0.98, 0, WOOD2, 0), box(0.05, 0.5, 0.05, -0.3, 0.3, 0.5, WOOD), box(0.05, 0.5, 0.05, 0.3, 0.3, 0.5, WOOD), box(0.05, 0.5, 0.05, -0.3, 0.3, -0.5, WOOD), box(0.05, 0.5, 0.05, 0.3, 0.3, -0.5, WOOD),
    ...[-1, 1].flatMap((sx) => [-0.5, 0.5].map((z) => ({ g: new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10), m: M(sx * 0.4, 0.2, z, 0, 1, 1, 1, 0, Math.PI / 2), c: '#4a3420' })))], legs: [], arm: [], armAt: [0, 0, 0], scale: 1.0 }),
};
const cacheU = new Map();
export function unitModel(kind, team) {
  let ent = cacheU.get(kind);
  if (!ent) {
    const d = (U[kind] || U.recruit)();
    ent = { baked: bake(d.body.filter(Boolean)), legs: (d.legs || []).map((l) => ({ baked: bake([{ ...l, m: new Matrix4() }]), hip: l.hip, c: l.c })), arm: d.arm && d.arm.length ? bake(d.arm.filter(Boolean)) : null, armAt: d.armAt, scale: d.scale || 1, noSwing: !!d.noSwing };
    cacheU.set(kind, ent);
  }
  const g = assemble(ent.baked, team), parts = { legs: [], arm: null, scale: ent.scale, noSwing: ent.noSwing };
  for (const l of ent.legs) { const lg = assemble(l.baked, team); lg.position.set(...l.hip); g.add(lg); parts.legs.push(lg); }
  if (ent.arm) { const a = assemble(ent.arm, team); a.position.set(...ent.armAt); g.add(a); parts.arm = a; }
  g.userData.parts = parts; g.scale.setScalar(ent.scale);
  return g;
}

// ---- trees, ore, berries, props: instanced where there are many
export const treeGeos = (() => {
  const oak = (s) => bake([cyl(0.1 * s, 0.55 * s, 0, 0, 0, '#6a4a2a', 6, 0.07 * s), ball(0.42 * s, 0, 0.45 * s, 0, '#4e8a3c', 1, 7), ball(0.3 * s, 0.22 * s, 0.7 * s, 0.1 * s, '#5a9a44', 1, 6), ball(0.28 * s, -0.2 * s, 0.62 * s, -0.1 * s, '#448034', 1, 6)]);
  const pine = (s) => bake([cyl(0.08 * s, 0.4 * s, 0, 0, 0, '#5a3e24', 6), cone(0.42 * s, 0.6 * s, 0, 0.25 * s, 0, '#2f6a3c', 7), cone(0.33 * s, 0.55 * s, 0, 0.6 * s, 0, '#38783f', 7), cone(0.22 * s, 0.5 * s, 0, 0.95 * s, 0, '#41864a', 7)]);
  const palm = (s) => bake([cyl(0.07 * s, 1.0 * s, 0, 0, 0, '#9a7a4a', 5, 0.045 * s), ...[0, 1, 2, 3, 4].map((i) => ({ g: new THREE.ConeGeometry(0.1 * s, 0.7 * s, 4), m: M(Math.cos(i * 1.256) * 0.3 * s, 0.95 * s, Math.sin(i * 1.256) * 0.3 * s, 0, 1, 1, 1, Math.sin(i * 1.256) * 1.2, -Math.cos(i * 1.256) * 1.2), c: '#5a9a3c' }))]);
  return { oak: oak(1.4), pine: pine(1.5), palm: palm(1.4) };
})();
export const propGeos = {
  rock: bake([cone(0.28, 0.3, 0, 0, 0, '#8d8a82', 5), cone(0.17, 0.22, 0.2, 0, 0.1, '#7c7a72', 5)]),
  bush: bake([ball(0.25, 0, 0, 0, '#5b8a3a', 0.8, 6), ball(0.17, 0.2, 0, 0.1, '#6b9a44', 0.8, 5)]),
  tuft: bake([cone(0.06, 0.25, 0, 0, 0, '#7cae50', 4), cone(0.06, 0.2, 0.08, 0, 0.04, '#6a9c42', 4), cone(0.06, 0.2, -0.07, 0, 0.05, '#86b858', 4)]),
};
const ORE = { stone: '#9b978c', copper: '#c97a46', iron: '#7e8fa6', coal: '#2b2b30', silver: '#dfe6ee', gold: '#f0c63a' };
export function nodeModel(kind) {
  let p;
  if (kind === 'berry') p = [ball(0.32, 0, 0, 0, '#3f7a35', 0.8, 7), ...[0, 1, 2, 3, 4, 5].map((i) => ball(0.06, Math.cos(i) * 0.26, 0.2 + (i % 2) * 0.1, Math.sin(i) * 0.26, '#c8284a', 1, 4))];
  else if (kind === 'gold') p = [cone(0.5, 0.5, 0, 0, 0, '#8a867c', 6), ...[0, 1, 2, 3].map((i) => ball(0.11, Math.cos(i * 1.6) * 0.3, 0.25, Math.sin(i * 1.6) * 0.3, ORE.gold, 0.8, 4)), ball(0.14, 0, 0.48, 0, ORE.gold, 0.8, 4)];
  else p = [cone(0.5, 0.55, 0, 0, 0, '#8d887c', 6), cone(0.3, 0.4, 0.35, 0, 0.1, '#7c776b', 5), ...[0, 1, 2].map((i) => ball(0.09, Math.cos(i * 2.1) * 0.28, 0.22, Math.sin(i * 2.1) * 0.28, ORE[kind] || '#aaa', 0.9, 4))];
  return bake(p);
}
export const fixedMaterial = matFixed;
export { teamMat };
