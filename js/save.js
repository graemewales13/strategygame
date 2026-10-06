// Auld World - save slots in the browser's localStorage. The Game does the (de)serialising; this only stores text.
const KEY = (slot) => `auld-world.save.${slot}`;
export const SLOTS = ['auto', 'manual'];
export function writeSave(slot, data) {
  try { localStorage.setItem(KEY(slot), JSON.stringify(data)); return true; } catch (e) { console.warn('[auld-world] save failed', e); return false; }
}
export function readSave(slot) {
  try { const s = localStorage.getItem(KEY(slot)); return s ? JSON.parse(s) : null; } catch (e) { console.warn('[auld-world] save unreadable', e); return null; }
}
export function saveInfo(slot) {
  const d = readSave(slot); if (!d) return null;
  return { saved: d.saved, minutes: Math.floor(d.time / 60), houses: d.houses, seed: d.seed };
}
export function clearSave(slot) { try { localStorage.removeItem(KEY(slot)); } catch { /* storage unavailable */ } }
export const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
