// Auld World - the tutorial (T04): a guided first match on a fixed seed with three houses on Easy. The rivals keep a truce with the
// learner until the lessons end (Game.truce), so nobody is overrun while reading. Pure functions of the game state and of a small
// context the UI fills in (what is selected, whether the camera moved, whether the Council was opened), so the steps test headless.
// Progress is saved with the match (game.tutorial.step, through the 'tutor' intent), so a load never sends the learner back.
import { PLAYER, MAP_SIZES } from './config.js';

// size: the tutorial always plays the small board, whatever Options > Board size says (T57: on Huge a learner walked for minutes)
export const TUTORIAL = { seed: 20261102, houses: 3, diff: 'easy', size: MAP_SIZES.small };

const serfs = (g) => g.units.filter((u) => u.team === PLAYER && u.kind === 'serf' && u.hp > 0);
const built = (g, kind) => g.buildings.some((b) => b.team === PLAYER && b.kind === kind && b.built >= 1 && b.hp > 0);
const placed = (g) => g.buildings.some((b) => b.team === PLAYER && b.hp > 0 && b.kind !== 'village');
const near = (g, list, from) => { let best = null, bd = Infinity; for (const e of list) { const d = Math.hypot(e.x - from.x, e.y - from.y); if (d < bd) { bd = d; best = e; } } return best; };
const home = (g) => g.seatOf(PLAYER) || g.kingOf(PLAYER);
// a village the learner holds that he neither started in nor founded: won by influence, a spy or a sack (T57)
export const wonVillage = (g) => g.villages.some((v) => v.owner === PLAYER && v.hp > 0 && v.home !== PLAYER && !v.founded);
const freeSeen = (g) => { const free = g.villages.filter((v) => v.owner < 0 && v.hp > 0), seen = free.filter((v) => !g.fogOn || g.wasSeen(PLAYER, v.x, v.y)); return near(g, seen.length ? seen : free, home(g) || { x: 0, y: 0 }); };   // (one already seen, so Show me does not lift the fog)
// the free village to win: the nearest seen one a few footmen can take (a hillfort's walls and guards beat a learner's first band)
const softSeen = (g) => { const free = g.villages.filter((v) => v.owner < 0 && v.hp > 0 && v.kind !== 'hillfort' && (v.maxProtection || v.protection) <= 320), seen = free.filter((v) => !g.fogOn || g.wasSeen(PLAYER, v.x, v.y)); return seen.length ? near(g, seen, home(g) || { x: 0, y: 0 }) : freeSeen(g); };
const cutting = (g) => serfs(g).some((u) => { const t = u.task || {}; const n = g.resources[t.type === 'gather' ? t.nodeId : t.resume]; return (t.type === 'gather' || t.type === 'return') && n && n.kind === 'tree'; });

// Each step: what to do, why, how it is checked (done) and where Show me looks (where). {key:x} is filled with the player's key.
export const LESSONS = [
  { id: 'look', title: 'Look around', hint: 'Move the view with {key:panUp}{key:panLeft}{key:panDown}{key:panRight} or the arrow keys, or click the minimap. Your home village is where you start.',
    done: (g, c) => !!c.panned },
  { id: 'select', title: 'Select your serfs', hint: 'Drag a box round your serfs (the folk in plain clothes beside your village), or press Idle under the minimap ({key:idleSerf}). Their orders show on the card at the bottom.',
    done: (g, c) => !!c.sel?.serf, where: (g) => near(g, serfs(g), home(g) || { x: 0, y: 0 }) },
  { id: 'timber', title: 'Cut timber', hint: 'With serfs selected, right-click a tree (or press Cut timber on their card). They fell it and carry the timber home by themselves. Timber raises almost every building.',
    done: (g) => cutting(g) || placed(g), where: (g) => near(g, g.resources.filter((r) => r.kind === 'tree' && r.amount > 0), home(g) || { x: 0, y: 0 }) },
  { id: 'draft', title: 'Draft a serf', hint: 'Press {key:hall} to select your home village, then Serf on its card: one villager joins you for a little grain. More hands, faster work.',
    done: (g, c) => serfs(g).length > (c.serfs0 ?? 3) || placed(g), where: (g) => home(g) },
  { id: 'farm', title: 'Raise a farm', hint: 'Select a serf, choose Farm on his card and click open ground near home. Serfs walk over and build it. A farm gives steady grain.',
    done: (g) => placed(g) },
  { id: 'barracks', title: 'Raise a barracks', hint: 'Build a Barracks the same way (140 timber, 40 coin). It trains soldiers. Keep cutting timber while it goes up.',
    done: (g) => built(g, 'barracks') },
  { id: 'train', title: 'Train a soldier', hint: 'Select the barracks and click Footman. Shift-click queues five; Repeat keeps them coming while you can pay.',
    done: (g) => g.soldiersOf(PLAYER).length >= 1, where: (g) => g.buildings.find((b) => b.team === PLAYER && b.kind === 'barracks' && b.hp > 0) },
  { id: 'king', title: 'Find your king', hint: 'Click your king, or press {key:king}. Your house falls only when the last of its royal line dies: the king and his two heirs. Keep him safe, and hunt the kings of your rivals.',
    done: (g, c) => !!c.sel?.king, where: (g) => g.kingOf(PLAYER) },
  { id: 'village', title: 'Look at a free village', hint: 'Click a village no house holds. Its loyalty turns towards you while your keeps, soldiers or spies stand near it; win it and it pays you tribute. You can also sack it.',
    done: (g, c) => !!c.sel?.freeVillage || wonVillage(g), where: freeSeen },
  { id: 'win', title: 'Win a village', hint: 'Train two or three soldiers, select them and right-click a free hamlet, abbey or mining camp (Show me finds one) to sack it: once its protection is gone it is yours, with most of its stores, though its folk take it hard. Leave hillforts for later: their walls and guards beat a small band. Or raise a barracks or tavern beside a village and keep soldiers near: its loyalty turns to you without a blow.',
    done: (g) => wonVillage(g), where: softSeen },
  { id: 'council', title: 'Open the Council', hint: 'Press {key:council} or the Council button. It shows how every house reads you, and where you offer peace, trade or war. Rivals write letters there too.',
    done: (g, c) => !!c.council },
];

// the first lesson not yet done, never before the step already saved (a load keeps its place)
export function lessonAt(g, c = {}) {
  const t = g.tutorial; if (!t) return null;
  if (t.done) return { index: LESSONS.length, total: LESSONS.length, step: null, done: true };
  let i = Math.max(0, Math.min(LESSONS.length, t.step | 0));
  while (i < LESSONS.length && LESSONS[i].done(g, c)) i++;
  return { index: i, total: LESSONS.length, step: LESSONS[i] || null, done: i >= LESSONS.length };
}

// where Show me points for a lesson (an entity with x, y), or null
export function lessonTarget(g, step) { try { return step?.where ? step.where(g) || null : null; } catch { return null; } }

// the UI's context from its selection (pure, for tests)
export function lessonContext(g, sel) {
  const c = { sel: {} };
  if (!sel) return c;
  if (sel.type === 'units') for (const id of sel.ids) { const u = g.byId.get(id); if (!u || u.team !== PLAYER) continue; if (u.kind === 'serf') c.sel.serf = true; if (u.id === g.players[PLAYER].kingId) c.sel.king = true; }
  if (sel.type === 'village') { const v = g.byId.get(sel.id); if (v && v.owner < 0) c.sel.freeVillage = true; }
  return c;
}
