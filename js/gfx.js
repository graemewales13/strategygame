// Auld World - graphics quality: 0 Low, 1 Medium, 2 High. Remembered in the browser; read by terrain.js and render.js.
const KEY = 'auld-world.gfx';
export const gfx = { q: 2, onChange: null };
try { const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null; if (v !== null && v !== '') gfx.q = Math.max(0, Math.min(2, +v)); } catch (e) { /* storage blocked */ }
export function setQuality(q) {
  gfx.q = Math.max(0, Math.min(2, q | 0));
  try { localStorage.setItem(KEY, String(gfx.q)); } catch (e) { /* ignore */ }
  gfx.onChange?.(gfx.q);
}
