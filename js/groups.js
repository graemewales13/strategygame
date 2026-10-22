// Control groups (Ctrl+1-9) and the row that shows them on the HUD (T36). Pure helpers, so the rules test can check them headless.
import { PLAYER, RETREAT } from './config.js';

// the living soldiers and folk of a group, in the order they were stored (the dead and anything no longer the player's drop out)
export function groupUnits(game, ids) {
  return (ids || []).map((id) => game.byId.get(id)).filter((u) => u && u.type === 'unit' && u.hp > 0 && u.team === PLAYER);
}

// one chip per set group: its number, how many are left, the kind most in it, and whether any of them is in a fight now
export function groupRow(game, groups) {
  const row = [];
  for (const k of Object.keys(groups || {}).sort()) {
    const us = groupUnits(game, groups[k]);
    if (!us.length) continue;
    const by = {}; for (const u of us) by[u.kind] = (by[u.kind] || 0) + 1;
    const kind = Object.keys(by).sort((a, b) => by[b] - by[a] || (a < b ? -1 : 1))[0];
    const fighting = us.some((u) => game.time - (u.engagedT ?? -99) < RETREAT.engaged);   // (struck or striking in the last few seconds, as a rout counts it)
    row.push({ k, n: us.length, kind, fighting });
  }
  return row;
}

// a save's groups, kept only if they are well formed (keys 1-9, lists of ids)
export function cleanGroups(raw) {
  const out = {};
  if (raw && typeof raw === 'object') for (const [k, ids] of Object.entries(raw)) if (/^[1-9]$/.test(k) && Array.isArray(ids)) out[k] = ids.filter((id) => Number.isFinite(id));
  return out;
}
