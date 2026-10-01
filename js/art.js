// Seven Holds - painted art. The sprites are cut from the concept boards (assets/world/*) and recoloured per house at load.
// Nothing here is drawn procedurally except the ram, which the boards do not show.
import { HOUSES, GOOD_COLOR } from './config.js';

const LIST = {
  b: ['hall', 'keep', 'keep_blue', 'cottage', 'cottage_thatch', 'farm', 'mill', 'warehouse', 'market', 'forge', 'workshop', 'tavern', 'academy', 'temple', 'barracks', 'archery', 'stable', 'tower', 'village_cluster'],
  r: ['oak', 'pine', 'palm', 'berry', 'bush_s', 'bush_m', 'rock', 'gold'],
  u: ['serf', 'serf_dig1', 'serf_dig2', 'scout', 'footman', 'bowman', 'knight', 'spy', 'scholar'],
};
export const IMG = {};
// painted ground tiles cut from the terrain sheet: TILES[kind][variant], kind = grass dry sand rock dirt snow
export const TILE_KINDS = ['grass', 'dry', 'sand', 'rock', 'dirt', 'snow'];
export const TILES = {};
export function loadArt() {
  const jobs = [];
  for (const k of TILE_KINDS) {
    TILES[k] = [];
    for (let v = 0; v < 6; v++) jobs.push(new Promise((res) => { const i = new Image(); i.onload = () => { TILES[k][v] = i; res(); }; i.onerror = () => res(); i.src = `assets/terrain/${k}_${v}.png`; }));
  }
  for (const [dir, names] of Object.entries(LIST)) for (const n of names) {
    jobs.push(new Promise((res) => { const i = new Image(); i.onload = () => { IMG[n] = i; res(); }; i.onerror = () => res(); i.src = `assets/world/${dir}/${n}.png`; }));
  }
  return Promise.all(jobs);
}

// target hue (degrees) per house; the boards' banners are blue, the unit trim is yellow
const HUE = [46, 2, 214, 124, 284];
function rgb2hsv(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return [h, mx ? d / mx : 0, mx]; }
function hsv2rgb(h, s, v) { const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c; let r = 0, g = 0, b = 0; const k = Math.floor(h / 60) % 6; if (k === 0) [r, g, b] = [c, x, 0]; else if (k === 1) [r, g, b] = [x, c, 0]; else if (k === 2) [r, g, b] = [0, c, x]; else if (k === 3) [r, g, b] = [0, x, c]; else if (k === 4) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x]; return [(r + m) * 255, (g + m) * 255, (b + m) * 255]; }

const cache = new Map();
// mode: 'banner' recolours blue cloth (buildings); 'trim' recolours yellow cloth (units); team -1 = neutral grey-brown cloth
export function tinted(name, team, mode, flip = false, light = 1) {
  const key = `${name}|${team}|${mode}|${flip ? 1 : 0}|${light}`;
  let c = cache.get(key); if (c) return c;
  const img = IMG[name];
  if (!img) return null;
  c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d');
  if (flip) { x.translate(c.width, 0); x.scale(-1, 1); }
  x.drawImage(img, 0, 0);
  if ((mode && (team !== 0 || mode === 'banner')) || light !== 1) {
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data, target = team >= 0 ? HUE[team] : null;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] < 8) continue;
      if (mode) {
        const [h, s, v] = rgb2hsv(p[i], p[i + 1], p[i + 2]);
        const hit = mode === 'banner' ? (h > 190 && h < 262 && s > 0.28 && v > 0.16) : (h > 34 && h < 64 && s > 0.45 && v > 0.22);
        if (hit) {
          if (target == null) { const g = hsv2rgb(38, 0.28, v * 0.95); p[i] = g[0]; p[i + 1] = g[1]; p[i + 2] = g[2]; }
          else if (!(mode === 'trim' && team === 0)) { const g = hsv2rgb(target, Math.min(1, s * (team === 1 ? 1.05 : 1)), v); p[i] = g[0]; p[i + 1] = g[1]; p[i + 2] = g[2]; }
        }
      }
      if (light !== 1) { p[i] = Math.min(255, p[i] * light); p[i + 1] = Math.min(255, p[i + 1] * light); p[i + 2] = Math.min(255, p[i + 2] * light); }
    }
    x.putImageData(d, 0, 0);
  }
  cache.set(key, c); return c;
}

// the ram: nothing in the boards, so a dark, muted painted one
let ramC = null;
export function ramSprite(team) {
  const k = 'ram' + team; if (cache.has(k)) return cache.get(k);
  const f = HOUSES[team] || HOUSES[0], c = document.createElement('canvas'); c.width = 150; c.height = 100; const x = c.getContext('2d');
  const wood = (a, b, w, h, col) => { const g = x.createLinearGradient(0, a, 0, a + h); g.addColorStop(0, col); g.addColorStop(1, '#1e1409'); x.fillStyle = g; x.fillRect(b, a, w, h); };
  x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(75, 88, 62, 9, 0, 0, 7); x.fill();
  wood(48, 22, 100, 14, '#6a4a2a'); x.fillStyle = '#3d4046'; x.beginPath(); x.moveTo(120, 50); x.lineTo(146, 60); x.lineTo(120, 70); x.fill();
  x.fillStyle = '#4d3820'; x.beginPath(); x.moveTo(20, 50); x.lineTo(40, 14); x.lineTo(112, 14); x.lineTo(132, 50); x.closePath(); x.fill();
  for (let i = 0; i < 6; i++) { x.fillStyle = i % 2 ? '#5a4326' : '#6a4f2e'; x.fillRect(24 + i * 17, 16, 9, 34); }
  x.fillStyle = f.primary; x.fillRect(66, 18, 20, 22); x.strokeStyle = '#1e1409'; x.lineWidth = 2; x.strokeRect(66, 18, 20, 22);
  for (const wx of [38, 106]) { x.fillStyle = '#2a1c0e'; x.beginPath(); x.arc(wx, 76, 13, 0, 7); x.fill(); x.strokeStyle = '#7a5a30'; x.lineWidth = 2; x.stroke(); x.beginPath(); x.moveTo(wx - 12, 76); x.lineTo(wx + 12, 76); x.moveTo(wx, 64); x.lineTo(wx, 88); x.stroke(); }
  cache.set(k, c); return c;
}

// the camel: nothing in the boards, so a painted pack animal in house colours, facing right
export function camelSprite(team) {
  const k = 'camel' + team; if (cache.has(k)) return cache.get(k);
  const f = HOUSES[team] || HOUSES[0], c = document.createElement('canvas'); c.width = 120; c.height = 100; const x = c.getContext('2d');
  const fur = (y0, y1) => { const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#c9a266'); g.addColorStop(1, '#8a6a3a'); return g; };
  x.fillStyle = 'rgba(0,0,0,.33)'; x.beginPath(); x.ellipse(58, 92, 40, 6, 0, 0, 7); x.fill();
  x.strokeStyle = '#6e5230'; x.lineWidth = 5; x.lineCap = 'round';
  for (const [lx, ph] of [[34, 0], [42, 4], [70, 4], [78, 0]]) { x.beginPath(); x.moveTo(lx, 62); x.lineTo(lx + ph - 2, 90); x.stroke(); }
  x.fillStyle = fur(30, 72);
  x.beginPath(); x.ellipse(58, 56, 30, 16, 0, 0, 7); x.fill();
  x.beginPath(); x.ellipse(46, 40, 10, 13, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(68, 41, 10, 12, 0, 0, 7); x.fill();
  x.strokeStyle = '#b08f58'; x.lineWidth = 8; x.beginPath(); x.moveTo(84, 52); x.quadraticCurveTo(100, 40, 98, 22); x.stroke();
  x.fillStyle = '#b08f58'; x.beginPath(); x.ellipse(103, 20, 9, 6, -0.2, 0, 7); x.fill();
  x.fillStyle = '#2a1c0e'; x.beginPath(); x.arc(105, 18, 1.6, 0, 7); x.fill();
  x.fillStyle = f.primary; x.fillRect(44, 44, 30, 9); x.fillStyle = f.accent; x.fillRect(44, 51, 30, 3);
  x.fillStyle = '#7a5a2e'; x.fillRect(48, 34, 12, 11); x.fillStyle = '#9a7a44'; x.fillRect(62, 36, 9, 9);
  x.strokeStyle = '#2a1c0e'; x.lineWidth = 1.5; x.strokeRect(48, 34, 12, 11); x.strokeRect(62, 36, 9, 9);
  cache.set(k, c); return c;
}

// ---- ore deposits and the mine: recoloured from the board's gold pile and rock, assembled on a small canvas ----------
const ORE_LOOK = { copper: [24, 0.82, 0.95], iron: [212, 0.22, 0.66], silver: [210, 0.07, 1.18] };
export function oreSprite(kind, flip = false) {
  const key = `ore|${kind}|${flip ? 1 : 0}`; let c = cache.get(key); if (c) return c;
  if (kind === 'stone') return (cache.set(key, tinted('rock', 0, null, flip, 1.12)), cache.get(key));
  if (kind === 'coal') return (cache.set(key, tinted('rock', 0, null, flip, 0.34)), cache.get(key));
  const img = IMG.gold; if (!img) return null;
  c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d');
  if (flip) { x.translate(c.width, 0); x.scale(-1, 1); }
  x.drawImage(img, 0, 0);
  if (kind === 'gold') { cache.set(key, c); return c; }
  const d = x.getImageData(0, 0, c.width, c.height), p = d.data, [th, ts, tv] = ORE_LOOK[kind];
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 8) continue;
    const [h, sat, v] = rgb2hsv(p[i], p[i + 1], p[i + 2]);
    if (h > 28 && h < 70 && sat > 0.4 && v > 0.3) { const g = hsv2rgb(th, Math.min(1, ts * (0.6 + sat * 0.5)), Math.min(1, v * tv)); p[i] = g[0]; p[i + 1] = g[1]; p[i + 2] = g[2]; }
  }
  x.putImageData(d, 0, 0);
  cache.set(key, c); return c;
}

export function mineSprite(ore, team) {
  const key = `mine|${ore}|${team}`; let c = cache.get(key); if (c) return c;
  if (!IMG.rock) return null;
  const f = HOUSES[team] || HOUSES[0];
  c = document.createElement('canvas'); c.width = 170; c.height = 140; const x = c.getContext('2d');
  const R = (sc, dx, dy, w, flip, light) => { const im = tinted('rock', 0, null, flip, light); x.drawImage(im, dx, dy, w, w * im.height / im.width); };
  x.fillStyle = 'rgba(8,10,4,.35)'; x.beginPath(); x.ellipse(85, 122, 70, 12, 0, 0, 7); x.fill();
  R(1, 8, 62, 154, false, 0.82); R(1, 30, 34, 112, true, 0.9); R(1, 52, 12, 70, false, 1.0); R(1, 0, 82, 70, true, 0.78); R(1, 100, 80, 66, false, 0.8);
  // the adit: dark mouth under a timber frame
  const g = x.createRadialGradient(85, 98, 3, 85, 98, 28); g.addColorStop(0, '#030201'); g.addColorStop(1, '#17110a');
  x.fillStyle = g; x.beginPath(); x.moveTo(60, 120); x.lineTo(60, 92); x.quadraticCurveTo(85, 66, 110, 92); x.lineTo(110, 120); x.closePath(); x.fill();
  const wood = (x0, y0, w, h) => { const gr = x.createLinearGradient(x0, y0, x0 + w, y0); gr.addColorStop(0, '#8a6636'); gr.addColorStop(1, '#4a331a'); x.fillStyle = gr; x.fillRect(x0, y0, w, h); x.strokeStyle = '#1e1409'; x.lineWidth = 1.2; x.strokeRect(x0, y0, w, h); };
  wood(55, 86, 9, 36); wood(106, 86, 9, 36); wood(52, 80, 66, 9);
  x.strokeStyle = '#3a2814'; x.lineWidth = 3; x.beginPath(); x.moveTo(64, 90); x.lineTo(74, 82); x.moveTo(106, 90); x.lineTo(96, 82); x.stroke();
  // rails and an ore cart
  x.strokeStyle = '#2a1e10'; x.lineWidth = 2; x.beginPath(); x.moveTo(70, 122); x.lineTo(56, 134); x.moveTo(98, 122); x.lineTo(112, 134); x.stroke();
  // pennant in house colours
  x.fillStyle = '#3a2a16'; x.fillRect(118, 52, 2, 36); x.fillStyle = f.primary; x.beginPath(); x.moveTo(120, 53); x.lineTo(138, 58); x.lineTo(120, 65); x.closePath(); x.fill(); x.strokeStyle = f.accent; x.lineWidth = 1; x.stroke();
  // heap of this ore in front
  const o = oreSprite(ore, false); if (o) x.drawImage(o, 8, 100, 64, 64 * o.height / o.width);
  if (o) x.drawImage(oreSprite(ore, true), 112, 106, 52, 52 * o.height / o.width);
  cache.set(key, c); return c;
}
