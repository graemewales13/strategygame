// Auld World - tips on first sight (T58). The first time the player meets a rule that can cost him the match (a rival's demand, a war,
// a foe's army seen, a mine nobody digs, a hungry or wavering village, a village lost, an army that fled, his king fallen, his seat lost, empty coffers, a
// full house) a short card says what it means and what to do. Each tip shows once, remembered in the browser, and never during the
// tutorial's lessons (they teach the same things in order). Pure functions of the game state and a small per-match memory, so they test
// headless; the UI only decides when a card may show and keeps the list of tips already seen. Nothing here touches the simulation.
import { PLAYER, KING, DEFEND_R, MINE_JOBS, RETREAT, BUILDINGS, MARKET_RADIUS, CLASS_WORD, answerTo } from './config.js';

export const TIP_STORE = 'auld-world.tips';
export const TIP_GAP = 25;        // seconds of game time between two tips, so a bad minute is not a wall of cards
export const TIP_SHOW = 22;       // seconds a card stays up unless dismissed
export const WAVER = 30;          // a held village below this loyalty, pulled toward another lord, is wavering (it slips at 8)

const held = (g) => g.villages.filter((v) => v.owner === PLAYER && v.hp > 0);
const atWarWith = (g) => g.players.filter((p) => p.team !== PLAYER && p.alive && g.rel[PLAYER][p.team] === 'war');

export const TIPS = [
  { id: 'demand', title: 'A rival demands tribute',
    text: 'A letter that asks for coin is an ultimatum: pay it and the peace holds a while; refuse or ignore it and that house marches on you within the minute. Weigh his army against yours on the Council ({key:council}) before you answer.',
    when: (g) => g.offers.some((o) => o.to === PLAYER && o.kind === 'tribute') },
  { id: 'war', title: 'You are at war',
    text: `Idle soldiers within ${DEFEND_R} tiles turn on anyone who strikes your folk or buildings. {key:alert} jumps to where you are hit, {key:army} selects your army, {key:amove} attack-moves it. Keep your king behind the line: when your royal line ends, your house falls.`,
    when: (g) => atWarWith(g).length > 0 },
  { id: 'counter', title: 'Know what they field',
    text: `You have seen enough of a foe's army to answer it: ${['horse', 'bow', 'foot'].map((c) => `${answerTo(c).join(' and ').toLowerCase()} beat ${CLASS_WORD[c]}`).join(', ')}. The Council ({key:council}) and a click on any of their soldiers show what your eyes have seen of each house's army; train the answer before you march.`,
    when: (g) => atWarWith(g).some((p) => g.armySeen(PLAYER, p.team)?.top) },
  { id: 'idlemine', title: 'A mine with nobody to dig it',
    text: `Mines are worked by the folk of villages within ${MINE_JOBS.r} tiles, never by serfs. Win or found a village near the deposit (serfs can found a mining camp beside ore), or raise your next mine closer to the villages you hold.`,
    when: (g) => g.buildings.some((b) => b.team === PLAYER && b.kind === 'mine' && b.built >= 1 && b.hp > 0 && g.minersOf(b) === 0) },
  { id: 'hungry', title: 'A village is running out of grain',
    text: 'A held village eats from its own store; when it runs dry its folk leave and it shrinks. Select it and press Send grain to cart grain from your stockpile, or hold a Feast at a keep. The ledger ({key:ledger}) lists every hungry village.',
    when: (g) => g.hungryVillages(PLAYER).length > 0 },
  { id: 'waver', title: 'A village is wavering',
    text: 'A village you hold is losing faith and being pulled toward another lord; at 8 loyalty it slips away. Soldiers billeted in it or standing watch beside it steady it, a keep near it pulls it back, and a Feast lifts its loyalty at once.',
    when: (g) => held(g).some((v) => v.loyalty < WAVER && v.lean >= 0 && v.lean !== PLAYER) },
  { id: 'lostvillage', title: 'A village has left you',
    text: 'A village you held is gone: sacked, won over by a rival\'s keeps and soldiers, or slipped for want of a lord nearby. You can win it back the same ways. Keep soldiers near the villages that pay you most.',
    when: (g, mem) => mem.lost > 0 },
  { id: 'rout', title: 'Your army fled the field',
    text: `Retreat ({key:retreat}) saves lives but it costs: every village of yours lost ${Math.round(RETREAT.loyalty * 100)}% of its loyalty, and it comes back slowly over ${Math.round(RETREAT.shame / 60)} minutes. The other kings read it as weakness. Fall back early, or not at all.`,
    when: (g) => (g.players[PLAYER].routs || 0) > 0 },
  { id: 'king', title: 'Your king has fallen',
    text: `The heir-apparent takes the crown in ${KING.heir} seconds, at your seat or wherever your house still holds, and reigns by that heir's trait (a soldier, a steward or a diplomat). When the king and every heir are dead, your house falls: the king's card ({key:king}) names the heirs left and lets you choose the next. Keep the new king out of the fighting.`,
    when: (g) => g.players[PLAYER].heirAt != null || g.players[PLAYER].heirs < KING.heirs },
  { id: 'seat', title: 'Your seat is lost',
    text: 'Losing the seat does not end your house, but your king is now a fugitive every house can see on the map. Raise a keep and win a village to rebuild, and keep him guarded.',
    when: (g) => !g.seatOf(PLAYER) },
  { id: 'broke', title: 'You cannot pay your soldiers',
    text: 'Past the first few, soldiers draw wages in coin. With empty coffers their pay falls behind, and after a while they start to desert. Sell goods at a market, send camels trading, or train fewer men.',
    when: (g) => (g.players[PLAYER].brokeT || 0) > 0 },
  { id: 'popcap', title: 'Your house is full',
    text: `No room for more folk: nothing new can be trained or drafted. Raise cottages (+${BUILDINGS.cottage.pop} each, once you have a market; within ${MARKET_RADIUS} tiles of one they also shop there) or win villages, whose folk are housed where they live.`,
    when: (g) => g.popUsed(PLAYER) >= g.popCap(PLAYER) && g.time > 60 },
];
export const TIP_IDS = TIPS.map((t) => t.id);

// per-match memory the UI keeps (a reset starts a new one): which villages the player held at the last look, and how many he lost since
export const tipMemory = () => ({ had: null, lost: 0 });
export function noteTips(g, mem) {
  const now = new Set(held(g).map((v) => v.id));
  if (mem.had) for (const id of mem.had) if (!now.has(id)) mem.lost++;
  mem.had = now;
  return mem;
}

// the tip to show now, or null: none in the tutorial's lessons, none once the match is over or the player's house has fallen, none
// within TIP_GAP seconds of the last one, and only a tip not yet seen whose rule holds now (the first in the list wins)
export function dueTip(g, seen, mem, lastAt = -1e9) {
  if (mem) noteTips(g, mem);
  if (g.outcome || !g.players[PLAYER]?.alive) return null;
  if (g.tutorial && !g.tutorial.done) return null;
  if (g.time - lastAt < TIP_GAP) return null;
  for (const t of TIPS) if (!seen.has(t.id) && t.when(g, mem || tipMemory())) return t;
  return null;
}

// the tips already seen, kept in the browser (a Set of ids); storage that is blocked or full is not an error, the tips just come again
export function loadSeen(store) {
  try { const v = JSON.parse(store?.getItem(TIP_STORE) || '[]'); return new Set(Array.isArray(v) ? v.filter((id) => TIP_IDS.includes(id)) : []); } catch { return new Set(); }
}
export function saveSeen(store, seen) {
  try { store?.setItem(TIP_STORE, JSON.stringify([...seen])); return true; } catch { return false; }
}
