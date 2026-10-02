// Auld World - entity factories and geometry helpers. Positions are in TILE units (floats), not pixels.

import { UNITS, BUILDINGS, VILLAGE_KINDS, VILLAGE_SIZE, VILLAGE_POP } from './config.js';

export function makeUnit(id, kind, team, x, y) {
  const s = UNITS[kind];
  return {
    id, type: 'unit', kind, team, x, y,
    hp: s.hp, maxHp: s.hp,
    path: [], pathGoal: null, task: { type: 'idle' },
    cooldown: 0, aggroT: Math.random() * 0.5, repathT: 0,
    carry: null, // { kind, amount }
    face: 1, anim: 0,
    inside: null, buildQ: [], cargo: null, home: null, hpMul: 1, dmgAdd: 0, spdAdd: 0, name: null, trait: null,
  };
}

export function makeBuilding(id, kind, team, tx, ty, built = true) {
  const s = BUILDINGS[kind];
  return {
    id, type: 'building', kind, team, tx, ty, size: s.size,
    x: tx + s.size / 2, y: ty + s.size / 2,
    hp: built ? s.hp : Math.max(1, s.hp * 0.12), maxHp: s.hp,
    built: built ? 1 : 0,
    queue: [], cooldown: 0, rally: null, flash: 0, garrison: [], drills: [],
  };
}

export function makeVillage(id, spec) {
  const k = VILLAGE_KINDS[spec.kind];
  return {
    id, type: 'village', kind: spec.kind, name: spec.name,
    tx: spec.tx, ty: spec.ty, size: VILLAGE_SIZE,
    x: spec.tx + VILLAGE_SIZE / 2, y: spec.ty + VILLAGE_SIZE / 2,
    owner: -1, lean: -1,
    protection: k.protection, maxProtection: k.protection,
    loyalty: k.loyalty, folk: k.folk.slice(),
    stores: { ...k.stores },
    hp: k.protection, maxHp: k.protection,
    spies: {}, flash: 0, garrison: [], popMax: VILLAGE_POP[spec.kind] || 10, pop: Math.round((VILLAGE_POP[spec.kind] || 10) * 0.7),
  };
}

export const hypot = Math.hypot;

// Distance from a point to an entity: edge distance for footprints, centre distance for units.
export function distTo(px, py, t) {
  if (t.size) {
    const dx = Math.max(t.tx - px, 0, px - (t.tx + t.size));
    const dy = Math.max(t.ty - py, 0, py - (t.ty + t.size));
    return Math.hypot(dx, dy);
  }
  return Math.max(0, Math.hypot(px - t.x, py - t.y) - 0.3);
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
