// Auld World - the key map (T03). Every keyboard command has an action id and a default key; the player can rebind them in
// Options, and the choice is kept in the browser. Pure data and helpers (no DOM), so the rules tests can check it.
// Fixed keys that cannot be taken: Esc (menu), F5/F9 (save/load), Tab (campaign map), 1-9 (control groups), the arrows (pan),
// Home (jump to the fight) and the modifier keys.

export const KEY_ACTIONS = [
  { id: 'panUp', label: 'Pan up', def: 'w', group: 'Camera' },
  { id: 'panLeft', label: 'Pan left', def: 'a', group: 'Camera' },
  { id: 'panDown', label: 'Pan down', def: 's', group: 'Camera' },
  { id: 'panRight', label: 'Pan right', def: 'd', group: 'Camera' },
  { id: 'hall', label: 'Home village', def: 'h', group: 'Camera' },
  { id: 'alert', label: 'Jump to the fight', def: ' ', group: 'Camera' },
  { id: 'campaign', label: 'Campaign map', def: 'm', group: 'Camera' },
  { id: 'king', label: 'Select your king', def: 'k', group: 'Select' },
  { id: 'idleSerf', label: 'Next idle serf or scout', def: '.', group: 'Select' },
  { id: 'army', label: 'Whole army', def: ',', group: 'Select' },
  { id: 'idleArmy', label: 'Idle soldiers', def: 'i', group: 'Select' },
  { id: 'idleProd', label: 'Next idle training building', def: 'y', group: 'Select' },
  { id: 'amove', label: 'Attack-move', def: 'f', group: 'Orders' },
  { id: 'patrol', label: 'Patrol', def: 'z', group: 'Orders' },
  { id: 'explore', label: 'Explore (scouts)', def: 'o', group: 'Orders' },
  { id: 'charge', label: 'Attack', def: 'g', group: 'Orders' },
  { id: 'retreat', label: 'Retreat', def: 'r', group: 'Orders' },
  { id: 'stop', label: 'Stop', def: 'x', group: 'Orders' },
  { id: 'bell', label: 'Town bell (shelter / back to work)', def: 'b', group: 'Orders' },
  { id: 'council', label: 'Council of Houses', def: 'c', group: 'Panels' },
  { id: 'standings', label: 'Standings', def: 't', group: 'Panels' },
  { id: 'econ', label: 'Economy overlay', def: 'e', group: 'Panels' },
  { id: 'production', label: 'Production overview', def: 'u', group: 'Panels' },
  { id: 'pause', label: 'Pause', def: 'p', group: 'Game' },
  { id: 'faster', label: 'Faster', def: '=', group: 'Game' },
  { id: 'slower', label: 'Slower', def: '-', group: 'Game' },
];
export const KEY_STORE = 'auld-world.keys';
const RESERVED = new Set(['escape', 'f5', 'f9', 'tab', 'home', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'control', 'alt', 'meta', 'enter', 'contextmenu', 'capslock', 'dead', 'unidentified']);
// a key as the game stores it: lower case, '+' folded onto '=' (the same key on most layouts)
export const normKey = (k) => { k = String(k || '').toLowerCase(); return k === '+' ? '=' : k; };
export const reservedKey = (k) => { k = normKey(k); return !k || RESERVED.has(k) || /^[1-9]$/.test(k) || /^f\d+$/.test(k); };
export const defaultKeys = () => Object.fromEntries(KEY_ACTIONS.map((a) => [a.id, a.def]));
// the saved map over the defaults; an unknown action, a reserved key or a key used twice falls back to the defaults for those actions
export function loadKeys(store) {
  const map = defaultKeys();
  let saved = null; try { saved = JSON.parse(store?.getItem(KEY_STORE) || 'null'); } catch { saved = null; }
  if (!saved || typeof saved !== 'object') return map;
  for (const a of KEY_ACTIONS) { const k = normKey(saved[a.id]); if (saved[a.id] != null && !reservedKey(k)) map[a.id] = k; }
  const seen = new Map();
  for (const a of KEY_ACTIONS) { const k = map[a.id]; if (seen.has(k)) return defaultKeys(); seen.set(k, a.id); }
  return map;
}
export function saveKeys(store, map) {
  const diff = {}; for (const a of KEY_ACTIONS) if (map[a.id] !== a.def) diff[a.id] = map[a.id];
  try { if (Object.keys(diff).length) store?.setItem(KEY_STORE, JSON.stringify(diff)); else store?.removeItem(KEY_STORE); return true; } catch { return false; }
}
// Bind `key` to `id`. Whatever held that key before takes the old key of `id` (a swap), so no key ever does two things.
// Returns { ok, swapped } or { ok: false, why }.
export function rebind(map, id, key) {
  const k = normKey(key);
  if (!KEY_ACTIONS.some((a) => a.id === id)) return { ok: false, why: 'No such command.' };
  if (reservedKey(k)) return { ok: false, why: `${keyName(k)} is kept for the game (Esc, F-keys, Tab, 1-9, arrows, Home, Enter, modifiers).` };
  const old = map[id], other = KEY_ACTIONS.find((a) => a.id !== id && map[a.id] === k);
  map[id] = k; if (other) map[other.id] = old;
  return { ok: true, swapped: other ? other.id : null };
}
export const actionOf = (map, key) => { const k = normKey(key); for (const a of KEY_ACTIONS) if (map[a.id] === k) return a.id; return null; };
export const keyName = (k) => (k === ' ' ? 'Space' : k === '=' ? '+' : !k ? '—' : k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1));

// The grid half of T03 (2026-10-17). With Grid keys on (Options > Keys), the command card's buttons answer to keys by their place, as in
// Age of Empires IV: three rows of four (Q W E R / A S D F / Z X C V), then the same twelve with Shift. The camera then pans with the arrows.
// A soldier's card fills the rows as orders, stances and formations; the build menu keeps each building on its own key while others are
// still locked, so a key never moves under the player's fingers.
export const GRID_KEYS = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'z', 'x', 'c', 'v'];
export const GRID_SLOTS = GRID_KEYS.length * 2;
export const GRID_STORE = 'auld-world.gridkeys';
export const gridLabel = (i) => (i >= 0 && i < GRID_KEYS.length ? GRID_KEYS[i].toUpperCase() : i >= GRID_KEYS.length && i < GRID_SLOTS ? '⇧' + GRID_KEYS[i - GRID_KEYS.length].toUpperCase() : '');
export const gridSlotOf = (key, shift) => { const i = GRID_KEYS.indexOf(normKey(key)); return i < 0 ? -1 : i + (shift ? GRID_KEYS.length : 0); };
// Slots for the buttons of one card, in order. `fixed[i]` is a button's own slot or null; `reserved` slots are kept free for buttons that
// may appear later (locked buildings). Fixed buttons keep their slot; the rest take the free slots in order; past 24, a button has none (-1).
export function assignGrid(fixed, reserved = []) {
  const used = new Set([...reserved, ...fixed.filter((s) => s != null && s >= 0 && s < GRID_SLOTS)]);
  let next = 0;
  return fixed.map((s) => {
    if (s != null && s >= 0 && s < GRID_SLOTS) return s;
    while (next < GRID_SLOTS && used.has(next)) next++;
    if (next >= GRID_SLOTS) return -1;
    used.add(next); return next++;
  });
}
export const loadGrid = (store) => { try { return store?.getItem(GRID_STORE) === 'on'; } catch { return false; } };
export const saveGrid = (store, on) => { try { if (on) store?.setItem(GRID_STORE, 'on'); else store?.removeItem(GRID_STORE); return true; } catch { return false; } };
// Text that names a key says {key:<action>} and is filled from the player's key map, so a hint never names a key that no longer does it.
export const fillKeys = (text, map) => String(text).replace(/\{key:(\w+)\}/g, (_, id) => keyName(map?.[id] ?? KEY_ACTIONS.find((a) => a.id === id)?.def));
