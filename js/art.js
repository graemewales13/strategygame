// Seven Holds - painted art. The sprites are cut from the concept boards (assets/world/*) and recoloured per house at load.
// Nothing here is drawn procedurally except the ram, which the boards do not show.
import { HOUSES } from './config.js';

const LIST = {
  b: ['hall', 'keep', 'keep_blue', 'cottage', 'cottage_thatch', 'farm', 'mill', 'warehouse', 'market', 'forge', 'workshop', 'tavern', 'academy', 'temple', 'barracks', 'archery', 'stable', 'tower', 'village_cluster'],
  r: ['oak', 'berry', 'bush_s', 'bush_m', 'rock', 'gold'],
  u: ['serf', 'serf_dig1', 'serf_dig2', 'scout', 'footman', 'bowman', 'knight', 'spy', 'scholar'],
};
export const IMG = {};
export function loadArt() {
  const jobs = [];
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
