// Auld World - guided objectives for a first match. Pure functions of the game state (no DOM) so they can be tested headless.
// Each step is "done" by what the player now has, so loading a save or skipping ahead needs no bookkeeping.
import { PLAYER } from './config.js';

const mine = (g, kind) => g.buildings.some((b) => b.team === PLAYER && b.kind === kind && b.built >= 1 && b.hp > 0);
const count = (g, kind) => g.buildings.filter((b) => b.team === PLAYER && b.kind === kind && b.built >= 1 && b.hp > 0).length;
const anyBuilt = (g) => g.buildings.some((b) => b.team === PLAYER && b.built >= 1 && b.hp > 0 && b.kind !== 'village');
const serfs = (g) => g.units.filter((u) => u.team === PLAYER && u.kind === 'serf' && u.hp > 0).length;
const soldiers = (g) => g.militaryOf(PLAYER).length;
const heldVillages = (g) => g.villages.filter((v) => v.owner === PLAYER && v.home !== PLAYER).length;

export const OBJECTIVES = [
  { id: 'timber', title: 'Cut timber', hint: 'Drag a box round your three serfs, then right-click a tree. They carry timber home.',
    done: (g) => g.players[PLAYER].wood > 500 * g.diff.playerMul || anyBuilt(g) },
  { id: 'serfs', title: 'Draft more serfs', hint: 'Press H to open your home village and draft serfs. More hands, faster work.',
    done: (g) => serfs(g) >= 6 || anyBuilt(g) },
  { id: 'mine', title: 'Raise a mine', hint: 'Open the build menu, choose Mine and place it on a deposit (the glints in the rock). Villagers from villages within 16 tiles dig for it; with no village near it has no workers.',
    done: (g) => mine(g, 'mine') },
  { id: 'market', title: 'Raise a market', hint: 'Mines feed a market. It sells their ore and earns coin from the homes and villages around it.',
    done: (g) => mine(g, 'market') },
  { id: 'community', title: 'Build a community', hint: 'Keep a mine, a foundry, cottages and a tavern within 20 tiles of the market. Select the market to see which links it lacks.',
    done: (g) => g.buildings.some((b) => b.team === PLAYER && b.kind === 'market' && b.built >= 1 && g.district(b).score >= 3) },
  { id: 'keep', title: 'Raise a keep and barracks', hint: 'The keep sways nearby villages and drills soldiers. The barracks trains them.',
    done: (g) => mine(g, 'keep') && mine(g, 'barracks') },
  { id: 'camel', title: 'Send a camel trading', hint: 'Train a camel at the market, select it, then press All my markets or Trade partners (or click markets on the map). It loops for ever, hauling goods.',
    done: (g) => g.units.some((u) => u.team === PLAYER && u.kind === 'camel' && u.route && u.route.stops.length) || g.players[PLAYER].trips > 0 },
  { id: 'village', title: 'Win a village', hint: 'Station soldiers or a keep beside an independent village, or send a spy, until its loyalty turns. You can also sack it.',
    done: (g) => heldVillages(g) >= 1 },
  { id: 'army', title: 'Raise an army', hint: 'Drill eight soldiers. Rivals march after about ten minutes of peace.',
    done: (g) => soldiers(g) >= 8 },
  { id: 'conquer', title: 'Rule the valley', hint: 'A house falls when the last of its royal line dies (a king and two heirs). Kill every rival line, and guard your own. Press T for standings.',
    done: () => false },
];

// the first step the player has not done, and how many are behind them
export function progress(g) {
  let i = 0; while (i < OBJECTIVES.length - 1 && OBJECTIVES[i].done(g)) i++;
  return { index: i, total: OBJECTIVES.length, step: OBJECTIVES[i], steps: OBJECTIVES.map((o, k) => ({ id: o.id, title: o.title, done: k < i })) };
}
