// Seven Holds - painted sprites. Everything is drawn once with canvas calls into small offscreen canvases
// (3/4 view, light from the upper left) and cached per kind x house. render.js only blits them.
// Coordinates inside a painter: origin = top-left of the building footprint, S = footprint edge in px,
// negative y rises above the footprint.
import { HOUSES, TILE } from './config.js';

export const R = 2;               // texture scale: sprite px per world px
export const U = TILE * R;        // sprite px per tile
const INK = '#1b130b';

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; };
const seeded = (s) => () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };
const lighten = (c, t) => mix(c, '#ffffff', t), darken = (c, t) => mix(c, '#000000', t);

let gritPat = null;
function grit(c) {
  if (!gritPat) {
    const g = mk(96, 96), x = g.getContext('2d'), r = seeded(77);
    for (let i = 0; i < 1500; i++) { x.fillStyle = r() > 0.5 ? 'rgba(0,0,0,.5)' : 'rgba(255,255,255,.45)'; x.fillRect(r() * 96, r() * 96, 1 + (r() > 0.7 ? 1 : 0), 1); }
    gritPat = c.createPattern(g, 'repeat');
  }
  return gritPat;
}
const texture = (c, a = 0.22) => { c.save(); c.clip(); c.globalAlpha = a; c.fillStyle = grit(c); c.fillRect(-2000, -2000, 4000, 4000); c.restore(); };
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
const poly = (c, pts) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
const grad = (c, x, y, x2, y2, a, b) => { const g = c.createLinearGradient(x, y, x2, y2); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
const outline = (c, w = 2) => { c.lineWidth = w; c.strokeStyle = INK; c.lineJoin = 'round'; c.stroke(); };

function shadow(c, x, y, w, h, a = 0.32) {
  c.save(); c.fillStyle = `rgba(10,14,6,${a})`;
  poly(c, [[x + w * 0.02, y + h], [x + w * 0.1, y + h * 0.82], [x + w * 1.02, y + h * 0.82], [x + w * 1.1, y + h * 0.98], [x + w * 0.98, y + h * 1.06], [x + w * 0.08, y + h * 1.04]]); c.fill(); c.restore();
}
function stones(c, x, y, w, h, base, rnd, bw = 15, bh = 9) {
  c.save(); rr(c, x, y, w, h, 1); c.clip();
  c.fillStyle = darken(base, 0.35); c.fillRect(x, y, w, h);
  for (let row = 0, yy = y; yy < y + h; row++, yy += bh) {
    for (let xx = x - (row % 2) * bw * 0.5; xx < x + w; xx += bw) {
      const v = (rnd() - 0.5) * 0.28;
      c.fillStyle = v > 0 ? lighten(base, v) : darken(base, -v);
      rr(c, xx + 1, yy + 1, bw - 2, bh - 2, 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(xx + 2, yy + 1, bw - 5, 1.2);
    }
  }
  c.restore();
}
function plaster(c, x, y, w, h, base, beam, rnd) {
  c.save(); rr(c, x, y, w, h, 1); c.clip();
  c.fillStyle = grad(c, x, y, x, y + h, lighten(base, 0.1), darken(base, 0.12)); c.fillRect(x, y, w, h);
  c.strokeStyle = beam; c.lineWidth = 3.2; c.lineCap = 'square';
  c.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  const n = Math.max(2, Math.round(w / 34));
  for (let i = 1; i < n; i++) { const xx = x + (w * i) / n; c.beginPath(); c.moveTo(xx, y); c.lineTo(xx, y + h); c.stroke(); }
  c.beginPath(); c.moveTo(x, y + h * 0.5); c.lineTo(x + w, y + h * 0.5); c.stroke();
  c.lineWidth = 2.2;
  for (let i = 0; i < n; i++) { if (rnd() > 0.45) continue; const xx = x + (w * i) / n; c.beginPath(); c.moveTo(xx, y + h); c.lineTo(xx + w / n, y + h * 0.5); c.stroke(); }
  texture(c, 0.2); c.restore();
}
function planks(c, x, y, w, h, base, rnd, vertical = true) {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  const n = vertical ? Math.round(w / 8) : Math.round(h / 8);
  for (let i = 0; i < n; i++) {
    const t = (rnd() - 0.5) * 0.3; c.fillStyle = t > 0 ? lighten(base, t) : darken(base, -t);
    if (vertical) c.fillRect(x + (w * i) / n, y, w / n + 0.5, h); else c.fillRect(x, y + (h * i) / n, w, h / n + 0.5);
    c.fillStyle = 'rgba(0,0,0,.35)'; if (vertical) c.fillRect(x + (w * i) / n, y, 1, h); else c.fillRect(x, y + (h * i) / n, w, 1);
  }
  texture(c, 0.2); c.restore();
}
function shingles(c, pts, base, rnd, rowH = 9, w = 11) {
  c.save(); poly(c, pts); c.clip();
  const ys = pts.map((p) => p[1]), xs = pts.map((p) => p[0]);
  const y0 = Math.min(...ys), y1 = Math.max(...ys), x0 = Math.min(...xs), x1 = Math.max(...xs);
  c.fillStyle = grad(c, 0, y0, 0, y1, lighten(base, 0.14), darken(base, 0.2)); c.fillRect(x0, y0, x1 - x0, y1 - y0);
  for (let row = 0, yy = y0; yy < y1 + rowH; row++, yy += rowH) {
    for (let xx = x0 - (row % 2) * w * 0.5; xx < x1 + w; xx += w) {
      const v = (rnd() - 0.5) * 0.22; c.fillStyle = v > 0 ? lighten(base, v) : darken(base, -v);
      c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx + w, yy); c.lineTo(xx + w, yy + rowH * 0.7); c.arc(xx + w / 2, yy + rowH * 0.7, w / 2, 0, Math.PI); c.closePath(); c.fill();
    }
    c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(x0, yy + rowH - 2, x1 - x0, 1.6);
  }
  texture(c, 0.18); c.restore();
  poly(c, pts); outline(c, 2);
}
function thatch(c, pts, base, rnd) {
  c.save(); poly(c, pts); c.clip();
  const ys = pts.map((p) => p[1]), xs = pts.map((p) => p[0]);
  const y0 = Math.min(...ys), y1 = Math.max(...ys), x0 = Math.min(...xs), x1 = Math.max(...xs);
  c.fillStyle = grad(c, 0, y0, 0, y1, lighten(base, 0.18), darken(base, 0.25)); c.fillRect(x0, y0, x1 - x0, y1 - y0);
  for (let i = 0; i < 260; i++) { const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0); c.strokeStyle = rnd() > 0.5 ? 'rgba(255,230,150,.28)' : 'rgba(60,35,10,.3)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rnd() - 0.5) * 3, y + 7 + rnd() * 5); c.stroke(); }
  c.restore(); poly(c, pts); outline(c, 2);
}
function window_(c, x, y, w, h, lit = true) {
  c.fillStyle = '#3a2a18'; rr(c, x - 2, y - 2, w + 4, h + 4, 2); c.fill();
  c.fillStyle = lit ? grad(c, 0, y, 0, y + h, '#ffe38a', '#e0902c') : '#27343d'; rr(c, x, y, w, h, 1.5); c.fill();
  c.strokeStyle = '#3a2a18'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x + w / 2, y); c.lineTo(x + w / 2, y + h); c.moveTo(x, y + h / 2); c.lineTo(x + w, y + h / 2); c.stroke();
}
function door(c, x, y, w, h, arched = true, col = '#4a2f18') {
  c.fillStyle = '#2a1a0c'; c.beginPath(); c.moveTo(x - 2, y + h); c.lineTo(x - 2, y + (arched ? w / 2 : 0)); if (arched) c.arc(x + w / 2, y + w / 2, w / 2 + 2, Math.PI, 0); else c.lineTo(x + w + 2, y); c.lineTo(x + w + 2, y + h); c.fill();
  c.fillStyle = col; c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + (arched ? w / 2 : 0)); if (arched) c.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); else c.lineTo(x + w, y); c.lineTo(x + w, y + h); c.fill();
  c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + w / 2, y + 2); c.lineTo(x + w / 2, y + h); c.stroke();
  c.fillStyle = '#d6b25a'; c.fillRect(x + w * 0.62, y + h * 0.55, 2.2, 2.2);
}
function steps(c, x, y, w, n = 3) { for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? '#8e8878' : '#a29b88'; c.fillRect(x - i * 3, y + i * 4, w + i * 6, 4); c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x - i * 3, y + i * 4 + 3.4, w + i * 6, 1); } }
function pole(c, x, y, h) { c.fillStyle = '#6a4a28'; c.fillRect(x - 1.6, y, 3.2, h); c.fillStyle = '#d6b25a'; c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); outline(c, 1); }
function crenel(c, x, y, w, base, n) {
  const cw = w / (n * 2 - 1);
  for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? base : lighten(base, 0.06); c.fillRect(x + i * cw * 2, y - 9, cw, 10); c.strokeStyle = INK; c.lineWidth = 1.5; c.strokeRect(x + i * cw * 2, y - 9, cw, 10); }
}
function barrel(c, x, y, s = 1) { c.fillStyle = '#6a4724'; rr(c, x - 6 * s, y - 14 * s, 12 * s, 14 * s, 4 * s); c.fill(); c.strokeStyle = '#2d1d0e'; c.lineWidth = 1.4; c.stroke(); c.fillStyle = '#9b9a92'; c.fillRect(x - 6 * s, y - 10 * s, 12 * s, 1.6); c.fillRect(x - 6 * s, y - 4 * s, 12 * s, 1.6); }
function crate(c, x, y, s = 1, col = '#8a6636') { c.fillStyle = col; c.fillRect(x - 7 * s, y - 13 * s, 14 * s, 13 * s); c.strokeStyle = '#3d2814'; c.lineWidth = 1.4; c.strokeRect(x - 7 * s, y - 13 * s, 14 * s, 13 * s); c.beginPath(); c.moveTo(x - 7 * s, y - 13 * s); c.lineTo(x + 7 * s, y); c.moveTo(x + 7 * s, y - 13 * s); c.lineTo(x - 7 * s, y); c.stroke(); }
function fence(c, x0, y, x1, post = 14) { c.strokeStyle = '#2d1d0e'; c.lineWidth = 1.2; for (let x = x0; x <= x1; x += post) { c.fillStyle = '#8a6636'; c.fillRect(x - 1.8, y - 10, 3.6, 12); c.strokeRect(x - 1.8, y - 10, 3.6, 12); } c.fillStyle = '#9a7442'; c.fillRect(x0, y - 8, x1 - x0, 2.6); c.fillRect(x0, y - 3, x1 - x0, 2.6); }
function sack(c, x, y, col = '#cdb98a') { c.fillStyle = col; c.beginPath(); c.ellipse(x, y - 6, 7, 7, 0, 0, 7); c.fill(); outline(c, 1.3); }
function bush(c, x, y, r, col, rnd) { for (let i = 0; i < 5; i++) { c.fillStyle = i % 2 ? col : lighten(col, 0.15); c.beginPath(); c.arc(x + (rnd() - 0.5) * r, y - rnd() * r * 0.6, r * (0.5 + rnd() * 0.3), 0, 7); c.fill(); } }

// ---------------------------------------------------------------------------------------------- buildings
// Generic gable house: front wall + sloped roof + side gable. Returns geometry for extras.
function house(c, rnd, o) {
  const { x, y, w, wallH, roofH, wall = 'plaster', roof = '#4b4f5a', plasterCol = '#d9c9a1', beam = '#4a3220', thatchRoof = false, depth = 14 } = o;
  const top = y - wallH;
  // side face (east): depth with gentle perspective
  c.fillStyle = darken(plasterCol, 0.38);
  poly(c, [[x + w, y], [x + w + depth, y - depth * 0.55], [x + w + depth, top - depth * 0.55], [x + w, top]]); c.fill(); outline(c, 1.6);
  // front wall
  if (wall === 'stone') stones(c, x, top, w, wallH, o.stoneCol || '#9a958a', rnd); else if (wall === 'planks') planks(c, x, top, w, wallH, o.plankCol || '#7a5a34', rnd); else plaster(c, x, top, w, wallH, plasterCol, beam, rnd);
  rr(c, x, top, w, wallH, 1); outline(c, 2);
  c.fillStyle = '#6f6b60'; c.fillRect(x - 1, y - 5, w + 2, 6); c.strokeStyle = INK; c.lineWidth = 1.4; c.strokeRect(x - 1, y - 5, w + 2, 6);
  // roof: long front slope plus the gable end on the right
  const ov = 7, ry = top + 3;
  const slope = [[x - ov, ry], [x + w + ov, ry], [x + w - roofH * 0.15, ry - roofH], [x + roofH * 0.15, ry - roofH]];
  const gable = [[x + w + ov, ry], [x + w + depth + ov * 0.6, ry - depth * 0.55], [x + w + depth * 0.7 - roofH * 0.1, ry - roofH - depth * 0.45], [x + w - roofH * 0.15, ry - roofH]];
  c.fillStyle = darken(roof, 0.35); poly(c, gable); c.fill(); outline(c, 1.8);
  if (thatchRoof) thatch(c, slope, roof, rnd); else shingles(c, slope, roof, rnd);
  c.fillStyle = 'rgba(255,255,255,.28)'; c.fillRect(x + roofH * 0.15, ry - roofH, w - roofH * 0.3, 2.4);
  c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(x, ry + 1, w, 5); // eave shadow
  return { top, ry, roofTop: ry - roofH };
}
function chimney(c, x, y, h, w = 11) { c.fillStyle = '#7d756a'; c.fillRect(x, y - h, w, h); c.fillStyle = '#968e82'; c.fillRect(x, y - h, 3, h); c.strokeStyle = INK; c.lineWidth = 1.5; c.strokeRect(x, y - h, w, h); c.fillStyle = '#6a635a'; c.fillRect(x - 2, y - h - 3, w + 4, 4); c.strokeRect(x - 2, y - h - 3, w + 4, 4); }
function banner(c, x, y, h) { pole(c, x, y, h); }

const PAINT = {
  hall(c, S, f, rnd, m) {
    shadow(c, S * 0.05, S * 0.6, S * 0.9, S * 0.4);
    barrel(c, S * 0.06, S * 0.96); barrel(c, S * 0.13, S * 0.98, 0.9); crate(c, S * 0.9, S * 0.97);
    const g = house(c, rnd, { x: S * 0.1, y: S * 0.9, w: S * 0.72, wallH: S * 0.3, roofH: S * 0.34, roof: '#454a57', plasterCol: '#d6c598', depth: S * 0.1 });
    // second gable (front dormer)
    c.fillStyle = '#d6c598'; poly(c, [[S * 0.34, g.ry - 2], [S * 0.58, g.ry - 2], [S * 0.46, g.ry - S * 0.2]]); c.fill(); outline(c, 1.8);
    shingles(c, [[S * 0.31, g.ry + 2], [S * 0.61, g.ry + 2], [S * 0.46, g.ry - S * 0.26]], '#4b505e', rnd, 8, 9);
    window_(c, S * 0.42, g.ry - S * 0.13, S * 0.08, S * 0.07);
    door(c, S * 0.4, S * 0.64, S * 0.12, S * 0.26); steps(c, S * 0.36, S * 0.9, S * 0.2, 2);
    window_(c, S * 0.17, S * 0.66, S * 0.09, S * 0.12); window_(c, S * 0.62, S * 0.66, S * 0.09, S * 0.12);
    chimney(c, S * 0.66, g.ry - S * 0.1, S * 0.2);
    banner(c, S * 0.52, S * 0.2, S * 0.3);
    m.flag = [0.52, 0.2]; m.smoke = [[0.7, 0.04]]; m.rise = S * 0.3;
  },
  keep(c, S, f, rnd, m) {
    shadow(c, S * 0.04, S * 0.55, S * 0.96, S * 0.5, 0.36);
    const bx = S * 0.12, bw = S * 0.7, by = S * 0.94, bh = S * 0.62, d = S * 0.12;
    c.fillStyle = '#6c675e'; poly(c, [[bx + bw, by], [bx + bw + d, by - d * 0.55], [bx + bw + d, by - bh - d * 0.55], [bx + bw, by - bh]]); c.fill(); outline(c, 1.8); // side
    stones(c, bx, by - bh, bw, bh, '#9d988c', rnd, 16, 10); rr(c, bx, by - bh, bw, bh, 1); outline(c, 2.2);
    crenel(c, bx, by - bh, bw, '#a8a396', 6);
    // corner turrets
    for (const tx of [bx - S * 0.07, bx + bw - S * 0.07]) {
      stones(c, tx, by - bh - S * 0.16, S * 0.14, bh + S * 0.2, '#8f8a7f', rnd, 12, 9); c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(tx, by - bh - S * 0.16, S * 0.14, bh + S * 0.2);
      crenel(c, tx - 2, by - bh - S * 0.16, S * 0.14 + 4, '#a8a396', 2);
    }
    // gate with banner cloth
    door(c, S * 0.38, by - S * 0.3, S * 0.18, S * 0.3, true, '#3e2a16'); c.strokeStyle = '#2a2824'; c.lineWidth = 1.2; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(S * 0.38 + i * S * 0.05, by - S * 0.27); c.lineTo(S * 0.38 + i * S * 0.05, by); c.stroke(); }
    c.fillStyle = f.primary; poly(c, [[S * 0.2, by - bh + 4], [S * 0.3, by - bh + 4], [S * 0.3, by - bh + S * 0.2], [S * 0.25, by - bh + S * 0.16], [S * 0.2, by - bh + S * 0.2]]); c.fill(); outline(c, 1.4);
    poly(c, [[S * 0.6, by - bh + 4], [S * 0.7, by - bh + 4], [S * 0.7, by - bh + S * 0.2], [S * 0.65, by - bh + S * 0.16], [S * 0.6, by - bh + S * 0.2]]); c.fill(); outline(c, 1.4);
    window_(c, S * 0.3, by - S * 0.42, S * 0.06, S * 0.1); window_(c, S * 0.56, by - S * 0.42, S * 0.06, S * 0.1);
    steps(c, S * 0.36, by, S * 0.22, 2);
    banner(c, S * 0.47, by - bh - S * 0.34, S * 0.3);
    m.flag = [0.47, (by - bh - S * 0.34) / S]; m.rise = S * 0.42;
  },
  cottage(c, S, f, rnd, m) {
    shadow(c, S * 0.08, S * 0.55, S * 0.84, S * 0.45);
    const g = house(c, rnd, { x: S * 0.12, y: S * 0.86, w: S * 0.62, wallH: S * 0.3, roofH: S * 0.34, roof: '#a0733a', thatchRoof: true, plasterCol: '#dcc9a0', depth: S * 0.12 });
    door(c, S * 0.36, S * 0.64, S * 0.13, S * 0.22, true); window_(c, S * 0.18, S * 0.66, S * 0.1, S * 0.1); window_(c, S * 0.56, S * 0.66, S * 0.1, S * 0.1);
    chimney(c, S * 0.58, g.ry - S * 0.08, S * 0.18);
    fence(c, S * 0.04, S * 0.99, S * 0.5); fence(c, S * 0.62, S * 0.99, S * 0.94);
    bush(c, S * 0.84, S * 0.9, 12, '#3f7a35', rnd); bush(c, S * 0.1, S * 0.9, 9, '#4d8a3a', rnd);
    c.fillStyle = f.primary; c.fillRect(S * 0.22, S * 0.3, 0, 0);
    // team pennant on the ridge
    pole(c, S * 0.22, g.roofTop - S * 0.14, S * 0.16); m.flag = [0.22, (g.roofTop - S * 0.14) / S]; m.smoke = [[0.58 + 0.03, (g.ry - S * 0.08 - S * 0.2) / S]]; m.rise = S * 0.35;
  },
  farm(c, S, f, rnd, m) {
    c.fillStyle = '#6a4a28'; poly(c, [[S * 0.04, S * 0.34], [S * 0.96, S * 0.34], [S * 1.0, S * 0.98], [S * 0.0, S * 0.98]]); c.fill(); outline(c, 1.5);
    for (let i = 0; i < 6; i++) { const yy = S * (0.4 + i * 0.095); c.fillStyle = '#3d2a16'; c.fillRect(S * 0.03, yy + S * 0.05, S * 0.94, 3); c.fillStyle = i % 2 ? '#9fbf3f' : '#bccf55'; for (let x = S * 0.06; x < S * 0.94; x += 7) { c.beginPath(); c.ellipse(x, yy + 4, 3.4, 5 + rnd() * 3, 0, 0, 7); c.fill(); } }
    fence(c, S * 0.0, S * 0.99, S * 1.0, 12);
    // barn at the back
    const g = house(c, rnd, { x: S * 0.1, y: S * 0.4, w: S * 0.34, wallH: S * 0.16, roofH: S * 0.2, wall: 'planks', roof: '#7a3c2a', depth: S * 0.07 });
    door(c, S * 0.2, S * 0.28, S * 0.14, S * 0.12, false, '#3c2814');
    // hay bales + scarecrow
    c.fillStyle = '#d8b650'; for (const [x, y] of [[0.66, 0.5], [0.76, 0.5], [0.71, 0.45]]) { rr(c, S * x - 9, S * y - 8, 18, 12, 4); c.fill(); outline(c, 1.2); }
    c.strokeStyle = '#6a4a28'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(S * 0.52, S * 0.75); c.lineTo(S * 0.52, S * 0.55); c.moveTo(S * 0.46, S * 0.6); c.lineTo(S * 0.58, S * 0.6); c.stroke();
    c.fillStyle = f.primary; c.fillRect(S * 0.49, S * 0.58, 8, 11); c.fillStyle = '#e0b88a'; c.beginPath(); c.arc(S * 0.52, S * 0.54, 4.5, 0, 7); c.fill();
    m.rise = S * 0.2;
  },
  mill(c, S, f, rnd, m) {
    shadow(c, S * 0.06, S * 0.55, S * 0.9, S * 0.45);
    // little pond + wheel on the left
    c.fillStyle = '#3d86a3'; c.beginPath(); c.ellipse(S * 0.18, S * 0.92, S * 0.2, S * 0.08, 0, 0, 7); c.fill(); outline(c, 1.4);
    const g = house(c, rnd, { x: S * 0.22, y: S * 0.88, w: S * 0.56, wallH: S * 0.36, roofH: S * 0.3, wall: 'planks', roof: '#7a5a3a', plankCol: '#7e5c36', plasterCol: '#7e5c36', depth: S * 0.1, thatchRoof: false });
    door(c, S * 0.46, S * 0.68, S * 0.12, S * 0.2, true); window_(c, S * 0.32, S * 0.58, S * 0.08, S * 0.1); window_(c, S * 0.62, S * 0.58, S * 0.07, S * 0.1);
    c.save(); c.translate(S * 0.14, S * 0.66); c.strokeStyle = '#4b3118'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, S * 0.2, 0, 7); c.stroke(); c.lineWidth = 2.4; for (let i = 0; i < 8; i++) { c.rotate(Math.PI / 4); c.beginPath(); c.moveTo(0, 0); c.lineTo(S * 0.2, 0); c.stroke(); c.fillStyle = '#7a5530'; c.fillRect(S * 0.16, -3, S * 0.07, 6); } c.restore();
    for (let i = 0; i < 3; i++) sack(c, S * (0.82 + i * 0.05), S * 0.97);
    pole(c, S * 0.5, g.roofTop - S * 0.14, S * 0.16); m.flag = [0.5, (g.roofTop - S * 0.14) / S]; m.rise = S * 0.3; m.wheel = [0.14, 0.66, 0.2];
  },
  warehouse(c, S, f, rnd, m) {
    shadow(c, S * 0.05, S * 0.55, S * 0.92, S * 0.45);
    const g = house(c, rnd, { x: S * 0.08, y: S * 0.88, w: S * 0.76, wallH: S * 0.34, roofH: S * 0.32, wall: 'planks', roof: '#4a4e5a', plankCol: '#7a5a34', plasterCol: '#7a5a34', depth: S * 0.1 });
    door(c, S * 0.34, S * 0.62, S * 0.26, S * 0.26, false, '#4a2f18'); c.strokeStyle = '#2a1a0c'; c.lineWidth = 2; c.beginPath(); c.moveTo(S * 0.34, S * 0.62); c.lineTo(S * 0.6, S * 0.88); c.moveTo(S * 0.6, S * 0.62); c.lineTo(S * 0.34, S * 0.88); c.stroke();
    crate(c, S * 0.1, S * 0.98); crate(c, S * 0.2, S * 0.99, 1.1); crate(c, S * 0.15, S * 0.9, 0.9); barrel(c, S * 0.72, S * 0.98); barrel(c, S * 0.8, S * 0.97, 0.9); sack(c, S * 0.9, S * 0.98); sack(c, S * 0.95, S * 0.95);
    pole(c, S * 0.2, g.roofTop - S * 0.14, S * 0.16); m.flag = [0.2, (g.roofTop - S * 0.14) / S]; m.rise = S * 0.3;
  },
  market(c, S, f, rnd, m) {
    shadow(c, S * 0.04, S * 0.6, S * 0.95, S * 0.4);
    const stall = (x, y, w, col1, col2, goods) => {
      c.fillStyle = '#5a3d1f'; c.fillRect(x + 2, y - S * 0.26, 4, S * 0.26); c.fillRect(x + w - 6, y - S * 0.26, 4, S * 0.26);
      c.fillStyle = '#7a5530'; c.fillRect(x, y - S * 0.12, w, S * 0.09); c.strokeStyle = INK; c.lineWidth = 1.5; c.strokeRect(x, y - S * 0.12, w, S * 0.09);
      goods(x, y - S * 0.12, w);
      const n = 6, aw = (w + 10) / n; c.save(); c.translate(x - 5, y - S * 0.34);
      for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? col1 : col2; poly(c, [[i * aw, 0], [(i + 1) * aw, 0], [(i + 1) * aw + 2, S * 0.1], [i * aw - 2, S * 0.1]]); c.fill(); c.beginPath(); c.arc((i + 0.5) * aw, S * 0.1, aw / 2, 0, Math.PI); c.fill(); }
      c.strokeStyle = INK; c.lineWidth = 1.4; c.strokeRect(0, 0, w + 10, 1); c.restore();
    };
    const apples = (x, y, w) => { for (let i = 0; i < 5; i++) { c.fillStyle = ['#c44', '#d8b43a', '#6aa84a'][i % 3]; c.beginPath(); c.arc(x + 8 + i * (w - 16) / 4, y - 4, 4.5, 0, 7); c.fill(); outline(c, 1); } };
    const cloth = (x, y, w) => { for (let i = 0; i < 4; i++) { c.fillStyle = [f.primary, '#e8e0c8', '#3d6fb0', f.accent][i]; c.fillRect(x + 4 + i * (w - 8) / 4, y - 8, (w - 8) / 4 - 2, 8); } };
    stall(S * 0.04, S * 0.58, S * 0.4, '#f0e8d0', '#3a63a8', apples);
    stall(S * 0.52, S * 0.64, S * 0.42, '#f0e8d0', f.primary, cloth);
    stall(S * 0.28, S * 0.95, S * 0.44, '#f0e8d0', '#b84a3a', apples);
    barrel(c, S * 0.08, S * 0.97); crate(c, S * 0.9, S * 0.97); sack(c, S * 0.82, S * 0.98);
    m.rise = S * 0.38;
  },
  forge(c, S, f, rnd, m) {
    shadow(c, S * 0.05, S * 0.55, S * 0.9, S * 0.45);
    const g = house(c, rnd, { x: S * 0.1, y: S * 0.88, w: S * 0.7, wallH: S * 0.32, roofH: S * 0.3, wall: 'stone', roof: '#3f434d', stoneCol: '#8a857a', plasterCol: '#8a857a', depth: S * 0.1 });
    c.fillStyle = '#1d1208'; rr(c, S * 0.2, S * 0.62, S * 0.22, S * 0.26, 3); c.fill(); c.fillStyle = grad(c, 0, S * 0.66, 0, S * 0.88, '#ffd36a', '#e2541a'); rr(c, S * 0.23, S * 0.68, S * 0.16, S * 0.18, 2); c.fill(); outline(c, 1.4);
    door(c, S * 0.52, S * 0.64, S * 0.12, S * 0.24, true);
    c.fillStyle = '#44464c'; poly(c, [[S * 0.84, S * 0.98], [S * 0.96, S * 0.98], [S * 0.94, S * 0.88], [S * 0.86, S * 0.88]]); c.fill(); outline(c, 1.4); c.fillRect(S * 0.85, S * 0.86, S * 0.1, 4);
    barrel(c, S * 0.08, S * 0.97);
    chimney(c, S * 0.62, g.ry - S * 0.05, S * 0.26, 14);
    pole(c, S * 0.16, g.roofTop - S * 0.12, S * 0.14); m.flag = [0.16, (g.roofTop - S * 0.12) / S]; m.smoke = [[0.66, (g.ry - S * 0.31) / S]]; m.glow = [0.31, 0.77, 0.12]; m.rise = S * 0.32;
  },
  workshop(c, S, f, rnd, m) {
    shadow(c, S * 0.05, S * 0.55, S * 0.92, S * 0.45);
    // open-fronted shed
    const x = S * 0.1, y = S * 0.86, w = S * 0.74, wh = S * 0.3;
    c.fillStyle = '#2d2013'; c.fillRect(x, y - wh, w, wh); planks(c, x, y - wh, w, wh * 0.25, '#6b4a2b', rnd);
    for (const px of [x + 2, x + w * 0.5 - 2, x + w - 6]) { c.fillStyle = '#5a3d1f'; c.fillRect(px, y - wh, 6, wh); }
    shingles(c, [[x - 8, y - wh + 4], [x + w + 8, y - wh + 4], [x + w - 8, y - wh - S * 0.26], [x + 8, y - wh - S * 0.26]], '#7a5a3a', rnd);
    c.fillStyle = '#7a5530'; c.fillRect(x + 8, y - S * 0.14, w - 16, S * 0.07); c.strokeStyle = INK; c.lineWidth = 1.4; c.strokeRect(x + 8, y - S * 0.14, w - 16, S * 0.07);
    c.strokeStyle = '#cfcab8'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(x + 22, y - S * 0.22); c.lineTo(x + 46, y - S * 0.14); c.stroke();
    c.fillStyle = '#9a9a9a'; poly(c, [[x + w - 40, y - S * 0.2], [x + w - 14, y - S * 0.2], [x + w - 14, y - S * 0.15], [x + w - 40, y - S * 0.15]]); c.fill(); outline(c, 1);
    for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#9a7442' : '#b08a52'; rr(c, S * 0.84 - (i % 2) * 4, S * 0.96 - i * 6, S * 0.14, 6, 2); c.fill(); outline(c, 1); }
    c.strokeStyle = '#555'; c.lineWidth = 2.5; c.beginPath(); c.arc(S * 0.22, S * 0.97, 9, 0, 7); c.stroke();
    pole(c, S * 0.22, y - wh - S * 0.4, S * 0.15); m.flag = [0.22, (y - wh - S * 0.4) / S]; m.rise = S * 0.4;
  },
  tavern(c, S, f, rnd, m) {
    shadow(c, S * 0.06, S * 0.55, S * 0.9, S * 0.45);
    const g = house(c, rnd, { x: S * 0.1, y: S * 0.88, w: S * 0.66, wallH: S * 0.38, roofH: S * 0.36, roof: '#4b4f5a', plasterCol: '#d9c291', beam: '#3a2412', depth: S * 0.12 });
    door(c, S * 0.4, S * 0.64, S * 0.13, S * 0.24, true, '#4a2f18');
    window_(c, S * 0.17, S * 0.54, S * 0.1, S * 0.12); window_(c, S * 0.58, S * 0.54, S * 0.1, S * 0.12); window_(c, S * 0.17, S * 0.7, S * 0.1, S * 0.1); window_(c, S * 0.58, S * 0.7, S * 0.1, S * 0.1);
    chimney(c, S * 0.6, g.ry - S * 0.08, S * 0.2);
    c.strokeStyle = '#2d1d0e'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(S * 0.8, S * 0.5); c.lineTo(S * 0.8, S * 0.62); c.lineTo(S * 0.7, S * 0.62); c.stroke();
    c.fillStyle = '#d6b25a'; rr(c, S * 0.72, S * 0.62, S * 0.1, S * 0.1, 3); c.fill(); outline(c, 1.2);
    barrel(c, S * 0.06, S * 0.97); barrel(c, S * 0.13, S * 0.98, 0.9); crate(c, S * 0.88, S * 0.97);
    pole(c, S * 0.2, g.roofTop - S * 0.14, S * 0.16); m.flag = [0.2, (g.roofTop - S * 0.14) / S]; m.smoke = [[0.64, (g.ry - S * 0.28) / S]]; m.rise = S * 0.34;
  },
  academy(c, S, f, rnd, m) {
    shadow(c, S * 0.05, S * 0.55, S * 0.92, S * 0.45);
    const bx = S * 0.1, bw = S * 0.72, by = S * 0.9, bh = S * 0.46;
    c.fillStyle = '#7c786e'; poly(c, [[bx + bw, by], [bx + bw + S * 0.1, by - S * 0.055], [bx + bw + S * 0.1, by - bh - S * 0.055], [bx + bw, by - bh]]); c.fill(); outline(c, 1.8);
    stones(c, bx, by - bh, bw, bh, '#b3ad9c', rnd, 15, 9); rr(c, bx, by - bh, bw, bh, 1); outline(c, 2.2);
    crenel(c, bx, by - bh, bw, '#bab4a3', 6);
    // domed lantern on top
    c.fillStyle = '#d9d2bc'; c.beginPath(); c.arc(S * 0.46, by - bh - S * 0.02, S * 0.17, Math.PI, 0); c.fill(); outline(c, 2); c.fillStyle = f.primary; c.beginPath(); c.arc(S * 0.46, by - bh - S * 0.02, S * 0.11, Math.PI, 0); c.fill(); outline(c, 1.4);
    banner(c, S * 0.46, by - bh - S * 0.32, S * 0.2);
    for (const wx of [0.2, 0.62]) { window_(c, S * wx, by - S * 0.34, S * 0.08, S * 0.14); }
    door(c, S * 0.4, by - S * 0.26, S * 0.12, S * 0.26, true); steps(c, S * 0.37, by, S * 0.18, 3);
    c.fillStyle = f.primary; for (const bx2 of [0.14, 0.7]) { poly(c, [[S * bx2, by - bh + 5], [S * bx2 + S * 0.08, by - bh + 5], [S * bx2 + S * 0.08, by - bh + S * 0.16], [S * bx2 + S * 0.04, by - bh + S * 0.12], [S * bx2, by - bh + S * 0.16]]); c.fill(); outline(c, 1.2); }
    m.flag = [0.46, (by - bh - S * 0.32) / S]; m.rise = S * 0.42;
  },
  temple(c, S, f, rnd, m) {
    shadow(c, S * 0.05, S * 0.55, S * 0.92, S * 0.45);
    const bx = S * 0.1, bw = S * 0.74, by = S * 0.92, bh = S * 0.42;
    c.fillStyle = '#a49f94'; poly(c, [[bx + bw, by], [bx + bw + S * 0.09, by - S * 0.05], [bx + bw + S * 0.09, by - bh - S * 0.05], [bx + bw, by - bh]]); c.fill(); outline(c, 1.8);
    stones(c, bx, by - bh, bw, bh, '#d8d3c4', rnd, 17, 10); rr(c, bx, by - bh, bw, bh, 1); outline(c, 2);
    steps(c, S * 0.3, by - 2, S * 0.34, 3);
    for (let i = 0; i < 4; i++) { const px = S * (0.2 + i * 0.16); c.fillStyle = grad(c, px, 0, px + 9, 0, '#f4f0e2', '#b9b4a4'); c.fillRect(px, by - bh + 4, 10, bh - 4); c.strokeStyle = INK; c.lineWidth = 1.3; c.strokeRect(px, by - bh + 4, 10, bh - 4); }
    c.fillStyle = '#e4dfcf'; poly(c, [[bx - 6, by - bh + 4], [bx + bw + 6, by - bh + 4], [S * 0.47, by - bh - S * 0.22]]); c.fill(); outline(c, 2);
    c.fillStyle = '#e2b84a'; c.beginPath(); c.arc(S * 0.47, by - bh - S * 0.07, S * 0.05, 0, 7); c.fill(); outline(c, 1.2);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.strokeStyle = '#e2b84a'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(S * 0.47 + Math.cos(a) * S * 0.065, by - bh - S * 0.07 + Math.sin(a) * S * 0.065); c.lineTo(S * 0.47 + Math.cos(a) * S * 0.095, by - bh - S * 0.07 + Math.sin(a) * S * 0.095); c.stroke(); }
    door(c, S * 0.4, by - S * 0.26, S * 0.14, S * 0.26, true, '#5a3a1c');
    pole(c, S * 0.47, by - bh - S * 0.4, S * 0.18); m.flag = [0.47, (by - bh - S * 0.4) / S]; m.rise = S * 0.42;
  },
  barracks(c, S, f, rnd, m) {
    shadow(c, S * 0.04, S * 0.55, S * 0.94, S * 0.45);
    const bx = S * 0.08, bw = S * 0.72, by = S * 0.92, bh = S * 0.5;
    c.fillStyle = '#6e6a60'; poly(c, [[bx + bw, by], [bx + bw + S * 0.1, by - S * 0.055], [bx + bw + S * 0.1, by - bh - S * 0.055], [bx + bw, by - bh]]); c.fill(); outline(c, 1.8);
    stones(c, bx, by - bh, bw, bh, '#9a958a', rnd, 16, 10); rr(c, bx, by - bh, bw, bh, 1); outline(c, 2.2);
    crenel(c, bx, by - bh, bw, '#a8a396', 6);
    door(c, S * 0.34, by - S * 0.3, S * 0.16, S * 0.3, true, '#3e2a16'); steps(c, S * 0.31, by, S * 0.22, 2);
    for (const bx2 of [0.16, 0.56]) { c.fillStyle = f.primary; poly(c, [[S * bx2, by - bh + 6], [S * bx2 + S * 0.09, by - bh + 6], [S * bx2 + S * 0.09, by - bh + S * 0.2], [S * bx2 + S * 0.045, by - bh + S * 0.15], [S * bx2, by - bh + S * 0.2]]); c.fill(); outline(c, 1.3); c.fillStyle = f.accent; c.fillRect(S * bx2 + S * 0.03, by - bh + 11, S * 0.03, S * 0.06); }
    // weapon rack and straw dummy
    c.fillStyle = '#5a3d1f'; c.fillRect(S * 0.84, by - S * 0.22, 3, S * 0.22); c.fillRect(S * 0.96, by - S * 0.22, 3, S * 0.22); c.fillRect(S * 0.84, by - S * 0.22, S * 0.15, 3);
    c.strokeStyle = '#d0ccc0'; c.lineWidth = 2.2; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(S * 0.86 + i * 4.5, by - S * 0.2); c.lineTo(S * 0.86 + i * 4.5 + 1, by - S * 0.02); c.stroke(); }
    c.fillStyle = '#d6b25a'; c.beginPath(); c.arc(S * 0.78, by - S * 0.05, 5, 0, 7); c.fill();
    banner(c, S * 0.44, by - bh - S * 0.22, S * 0.22); m.flag = [0.44, (by - bh - S * 0.22) / S]; m.rise = S * 0.3;
  },
  archery(c, S, f, rnd, m) {
    shadow(c, S * 0.04, S * 0.6, S * 0.94, S * 0.4, 0.24);
    c.fillStyle = '#8b6a3e'; poly(c, [[S * 0.0, S * 0.34], [S * 1.0, S * 0.34], [S * 1.0, S * 0.98], [S * 0.0, S * 0.98]]); c.fill(); c.save(); c.clip(); texture(c, 0.35); c.restore();
    // lean-to at the back
    c.fillStyle = '#4a3220'; c.fillRect(S * 0.06, S * 0.2, S * 0.6, S * 0.2);
    shingles(c, [[S * 0.02, S * 0.25], [S * 0.7, S * 0.25], [S * 0.66, S * 0.08], [S * 0.06, S * 0.08]], '#6b4a2b', rnd);
    for (const px of [0.1, 0.6]) { c.fillStyle = '#5a3d1f'; c.fillRect(S * px, S * 0.22, 5, S * 0.2); }
    for (let i = 0; i < 3; i++) { const tx = S * (0.2 + i * 0.28), ty = S * 0.8; c.fillStyle = '#6a4a28'; c.fillRect(tx - 2, ty - S * 0.1, 4, S * 0.16); c.fillStyle = '#e8e0c8'; c.beginPath(); c.arc(tx, ty - S * 0.12, S * 0.1, 0, 7); c.fill(); outline(c, 1.4); c.fillStyle = '#b8352b'; c.beginPath(); c.arc(tx, ty - S * 0.12, S * 0.065, 0, 7); c.fill(); c.fillStyle = '#e8e0c8'; c.beginPath(); c.arc(tx, ty - S * 0.12, S * 0.03, 0, 7); c.fill(); c.strokeStyle = '#d6c28a'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(tx + 3, ty - S * 0.14); c.lineTo(tx - 5, ty - S * 0.1); c.stroke(); }
    fence(c, S * 0.02, S * 0.99, S * 0.98, 15);
    c.fillStyle = f.primary; pole(c, S * 0.9, S * 0.1, S * 0.2); m.flag = [0.9, 0.1]; m.rise = S * 0.2;
  },
  stable(c, S, f, rnd, m) {
    shadow(c, S * 0.04, S * 0.55, S * 0.94, S * 0.45);
    const g = house(c, rnd, { x: S * 0.08, y: S * 0.84, w: S * 0.72, wallH: S * 0.3, roofH: S * 0.32, wall: 'planks', roof: '#3d4150', plankCol: '#7c5a32', plasterCol: '#7c5a32', depth: S * 0.1 });
    c.fillStyle = '#251a0e'; rr(c, S * 0.2, S * 0.6, S * 0.46, S * 0.24, 3); c.fill();
    for (let i = 0; i < 4; i++) { c.fillStyle = '#e0bf5a'; rr(c, S * (0.22 + i * 0.105), S * 0.7 + (i % 2) * 3, S * 0.09, S * 0.1, 3); c.fill(); outline(c, 1); }
    fence(c, S * 0.0, S * 0.99, S * 0.98, 15);
    c.fillStyle = '#e0bf5a'; for (const [x, y] of [[0.88, 0.9], [0.94, 0.86]]) { rr(c, S * x - 10, S * y - 10, 20, 12, 5); c.fill(); outline(c, 1.2); }
    pole(c, S * 0.2, g.roofTop - S * 0.14, S * 0.16); m.flag = [0.2, (g.roofTop - S * 0.14) / S]; m.rise = S * 0.3;
  },
  tower(c, S, f, rnd, m) {
    shadow(c, S * 0.1, S * 0.62, S * 0.84, S * 0.4, 0.34);
    const bx = S * 0.24, bw = S * 0.5, by = S * 0.92, bh = S * 0.9;
    c.fillStyle = '#6a665c'; poly(c, [[bx + bw, by], [bx + bw + S * 0.1, by - S * 0.05], [bx + bw + S * 0.1, by - bh - S * 0.05], [bx + bw, by - bh]]); c.fill(); outline(c, 1.8);
    stones(c, bx, by - bh, bw, bh, '#9a958a', rnd, 14, 10); rr(c, bx, by - bh, bw, bh, 1); outline(c, 2.2);
    c.fillStyle = '#8a857a'; c.fillRect(bx - 8, by - bh - 6, bw + 16, 14); c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(bx - 8, by - bh - 6, bw + 16, 14);
    crenel(c, bx - 8, by - bh - 6, bw + 16, '#a8a396', 4);
    c.fillStyle = '#1b130b'; rr(c, bx + bw * 0.38, by - bh * 0.78, bw * 0.24, bh * 0.14, 4); c.fill(); rr(c, bx + bw * 0.38, by - bh * 0.5, bw * 0.24, bh * 0.14, 4); c.fill();
    door(c, bx + bw * 0.32, by - S * 0.2, bw * 0.34, S * 0.2, true);
    c.strokeStyle = '#7a5530'; c.lineWidth = 3; c.beginPath(); c.moveTo(bx - 4, by); c.lineTo(bx + bw * 0.36, by - bh); c.moveTo(bx + 8, by); c.lineTo(bx + bw * 0.5, by - bh); c.stroke();
    for (let i = 1; i < 8; i++) { const t = i / 8; c.beginPath(); c.moveTo(bx - 4 + (bw * 0.36 + 4) * t * 0.9 + 0, by - bh * t); c.lineTo(bx + 8 + (bw * 0.5 - 8) * t, by - bh * t); c.stroke(); }
    banner(c, S * 0.5, by - bh - S * 0.3, S * 0.26); m.flag = [0.5, (by - bh - S * 0.3) / S]; m.rise = S * 0.42;
  },
};

// ---------------------------------------------------------------------------------------------- sprite cache
const bCache = new Map();
export function buildingSprite(kind, team, size) {
  const key = kind + '|' + team;
  let s = bCache.get(key); if (s) return s;
  const f = HOUSES[team] || HOUSES[0], S = size * U, rise = S * 0.5;
  const cv = mk(S + S * 0.2, S + rise), c = cv.getContext('2d'), m = { rise };
  c.translate(0, rise);
  const rnd = seeded(kind.length * 977 + kind.charCodeAt(0) * 31);
  (PAINT[kind] || PAINT.cottage)(c, S, f, rnd, m);
  s = { cv, rise: Math.max(m.rise, S * 0.2) + 6, full: rise, meta: m, S };
  bCache.set(key, s); return s;
}

// ---------------------------------------------------------------------------------------------- resources
const rCache = new Map();
export function treeSprite(variant) {
  const key = 't' + variant; let s = rCache.get(key); if (s) return s;
  const cv = mk(U * 1.1, U * 1.9), c = cv.getContext('2d'), r = seeded(variant * 91 + 5);
  const cx = cv.width / 2, base = cv.height - 6;
  c.fillStyle = 'rgba(8,16,6,.35)'; c.beginPath(); c.ellipse(cx + 5, base - 2, U * 0.34, U * 0.1, 0, 0, 7); c.fill();
  c.fillStyle = '#5a3a1a'; c.fillRect(cx - 4, base - U * 0.34, 8, U * 0.34); c.strokeStyle = INK; c.lineWidth = 1.4; c.strokeRect(cx - 4, base - U * 0.34, 8, U * 0.34);
  const pine = variant % 3 !== 2;
  if (pine) {
    const cols = [['#1f4d2a', '#2e6b37'], ['#1a4524', '#2a6234'], ['#24542c', '#357a3d']][variant % 3];
    for (let i = 0; i < 4; i++) {
      const w = U * (0.52 - i * 0.1), y = base - U * 0.3 - i * U * 0.34;
      c.fillStyle = cols[0]; poly(c, [[cx - w, y], [cx + w, y], [cx, y - U * 0.58]]); c.fill(); outline(c, 1.4);
      c.fillStyle = cols[1]; poly(c, [[cx - w, y], [cx - w * 0.1, y - U * 0.1], [cx, y - U * 0.58]]); c.fill();
    }
  } else {
    c.fillStyle = '#2d5e2e'; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(cx + (r() - 0.5) * U * 0.6, base - U * 0.8 - r() * U * 0.55, U * (0.26 + r() * 0.1), 0, 7); c.fill(); }
    c.fillStyle = '#4a8a3a'; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(cx + (r() - 0.7) * U * 0.55, base - U * 0.95 - r() * U * 0.5, U * (0.16 + r() * 0.08), 0, 7); c.fill(); }
  }
  s = { cv, ax: cx, ay: base }; rCache.set(key, s); return s;
}
export function goldSprite(variant) {
  const key = 'g' + variant; let s = rCache.get(key); if (s) return s;
  const cv = mk(U * 1.1, U * 1.0), c = cv.getContext('2d'), r = seeded(variant * 13 + 3);
  const cx = cv.width / 2, base = cv.height - 6;
  c.fillStyle = 'rgba(8,16,6,.35)'; c.beginPath(); c.ellipse(cx + 4, base - 2, U * 0.4, U * 0.1, 0, 0, 7); c.fill();
  for (const [dx, dy, sc] of [[-0.18, 0, 0.8], [0.18, 0, 0.9], [0, -0.1, 1.1]]) {
    const x = cx + dx * U, y = base + dy * U, w = U * 0.3 * sc;
    c.fillStyle = '#7d786c'; poly(c, [[x - w, y], [x - w * 0.7, y - w * 1.1], [x + w * 0.1, y - w * 1.6], [x + w * 0.9, y - w * 0.9], [x + w, y]]); c.fill(); outline(c, 1.5);
    c.fillStyle = '#a39d8e'; poly(c, [[x - w * 0.7, y - w * 1.1], [x + w * 0.1, y - w * 1.6], [x - w * 0.1, y - w * 0.6]]); c.fill();
    c.fillStyle = '#f1cd5a'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(x + (r() - 0.5) * w * 1.3, y - r() * w * 1.1 - 3, 3 + r() * 2.2, 0, 7); c.fill(); }
  }
  s = { cv, ax: cx, ay: base }; rCache.set(key, s); return s;
}
export function berrySprite(variant) {
  const key = 'b' + variant; let s = rCache.get(key); if (s) return s;
  const cv = mk(U * 1.0, U * 0.8), c = cv.getContext('2d'), r = seeded(variant * 29 + 1);
  const cx = cv.width / 2, base = cv.height - 6;
  c.fillStyle = 'rgba(8,16,6,.35)'; c.beginPath(); c.ellipse(cx + 3, base - 2, U * 0.36, U * 0.09, 0, 0, 7); c.fill();
  bush(c, cx, base - 2, U * 0.55, '#34702f', r);
  for (let i = 0; i < 9; i++) { c.fillStyle = i % 3 ? '#c23a56' : '#e8607a'; c.beginPath(); c.arc(cx + (r() - 0.5) * U * 0.7, base - 8 - r() * U * 0.3, 3.4, 0, 7); c.fill(); outline(c, 0.8); }
  s = { cv, ax: cx, ay: base }; rCache.set(key, s); return s;
}

// ---------------------------------------------------------------------------------------------- villages
function smallHouse(c, rnd, x, y, w, roof, wall = '#d2bf93', thatchIt = false) {
  const wh = w * 0.5, rh = w * 0.5;
  c.fillStyle = darken(wall, 0.35); poly(c, [[x + w, y], [x + w + w * 0.16, y - w * 0.09], [x + w + w * 0.16, y - wh - w * 0.09], [x + w, y - wh]]); c.fill(); outline(c, 1.4);
  plaster(c, x, y - wh, w, wh, wall, '#4a3220', rnd); rr(c, x, y - wh, w, wh, 1); outline(c, 1.6);
  const slope = [[x - 4, y - wh + 2], [x + w + 4, y - wh + 2], [x + w - rh * 0.2, y - wh - rh], [x + rh * 0.2, y - wh - rh]];
  c.fillStyle = darken(roof, 0.35); poly(c, [[x + w + 4, y - wh + 2], [x + w + w * 0.14, y - wh - w * 0.07], [x + w + w * 0.05, y - wh - rh - w * 0.06], [x + w - rh * 0.2, y - wh - rh]]); c.fill(); outline(c, 1.4);
  if (thatchIt) thatch(c, slope, roof, rnd); else shingles(c, slope, roof, rnd, 7, 9);
  door(c, x + w * 0.4, y - wh * 0.7, w * 0.18, wh * 0.7, true); window_(c, x + w * 0.12, y - wh * 0.78, w * 0.14, wh * 0.3);
  return { chim: [x + w * 0.66, y - wh - rh * 0.6] };
}
const vCache = new Map();
export function villageSprite(kind, owner) {
  const key = kind + '|' + owner; let s = vCache.get(key); if (s) return s;
  const f = owner >= 0 ? HOUSES[owner] : null, S = 3 * U, rise = S * 0.45;
  const cv = mk(S * 1.15, S + rise), c = cv.getContext('2d'), rnd = seeded(kind.charCodeAt(0) * 313 + kind.length), m = { rise };
  c.translate(0, rise);
  // trodden ground
  c.fillStyle = 'rgba(120,92,52,.55)'; c.beginPath(); c.ellipse(S / 2, S * 0.64, S * 0.5, S * 0.4, 0, 0, 7); c.fill();
  c.fillStyle = 'rgba(150,118,70,.55)'; c.beginPath(); c.ellipse(S / 2, S * 0.66, S * 0.4, S * 0.3, 0, 0, 7); c.fill();
  if (f) { c.strokeStyle = f.primary; c.globalAlpha = 0.85; c.lineWidth = 5; c.beginPath(); c.ellipse(S / 2, S * 0.64, S * 0.5, S * 0.4, 0, 0, 7); c.stroke(); c.strokeStyle = f.accent; c.lineWidth = 1.6; c.stroke(); c.globalAlpha = 1; }
  const roofs = ['#a2562f', '#8c4a2a', '#b36a3a', '#7a4a2a'];
  const chims = [];
  const place = (x, y, w, i, th = false) => { const g = smallHouse(c, rnd, x, y, w, roofs[i % 4], ['#d8c79c', '#cdb98a', '#dccaa0'][i % 3], th); chims.push(g.chim); };
  shadow(c, S * 0.06, S * 0.5, S * 0.9, S * 0.5, 0.2);
  if (kind === 'hillfort') {
    c.fillStyle = '#8a857a'; for (let i = 0; i < 2; i++) { stones(c, S * 0.02, S * (0.3 + i * 0.5), S * 0.96, S * 0.22, '#8d887c', rnd, 15, 9); }
    place(S * 0.12, S * 0.78, S * 0.26, 0); place(S * 0.62, S * 0.8, S * 0.28, 1);
    const bx = S * 0.38, bw = S * 0.26, by = S * 0.68, bh = S * 0.5;
    stones(c, bx, by - bh, bw, bh, '#a09b8f', rnd, 12, 9); rr(c, bx, by - bh, bw, bh, 1); outline(c, 2); crenel(c, bx - 3, by - bh, bw + 6, '#aea99c', 3); door(c, bx + bw * 0.3, by - S * 0.14, bw * 0.4, S * 0.14, true);
    m.flagAt = [0.5, (by - bh - S * 0.2) / S];
  } else if (kind === 'mine') {
    place(S * 0.1, S * 0.84, S * 0.28, 0); place(S * 0.45, S * 0.9, S * 0.26, 2, true);
    c.fillStyle = '#6b665c'; poly(c, [[S * 0.58, S * 0.62], [S * 0.7, S * 0.28], [S * 0.92, S * 0.3], [S * 0.98, S * 0.62]]); c.fill(); outline(c, 2);
    c.fillStyle = '#1b130b'; rr(c, S * 0.69, S * 0.42, S * 0.17, S * 0.2, 6); c.fill(); c.strokeStyle = '#7a5530'; c.lineWidth = 3; c.strokeRect(S * 0.69, S * 0.42, S * 0.17, S * 0.2);
    c.fillStyle = '#f1cd5a'; for (const [x, y] of [[0.62, 0.55], [0.9, 0.5], [0.76, 0.34]]) { c.beginPath(); c.arc(S * x, S * y, 4, 0, 7); c.fill(); }
    c.fillStyle = '#6a4a28'; rr(c, S * 0.46, S * 0.66, S * 0.12, S * 0.07, 2); c.fill(); outline(c, 1.2); c.fillStyle = '#f1cd5a'; c.fillRect(S * 0.47, S * 0.63, S * 0.1, 4);
    m.flagAt = [0.3, 0.3];
  } else if (kind === 'market') {
    place(S * 0.08, S * 0.8, S * 0.26, 3); place(S * 0.66, S * 0.78, S * 0.26, 0);
    for (const [x, col] of [[0.36, '#b84a3a'], [0.5, '#3a63a8'], [0.64, '#d8b43a']]) { const px = S * x; c.fillStyle = '#6a4a28'; c.fillRect(px - 10, S * 0.62, 20, 12); c.strokeStyle = INK; c.lineWidth = 1.3; c.strokeRect(px - 10, S * 0.62, 20, 12); for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#f0e8d0' : col; poly(c, [[px - 14 + i * 7, S * 0.46], [px - 7 + i * 7, S * 0.46], [px - 6 + i * 7, S * 0.55], [px - 15 + i * 7, S * 0.55]]); c.fill(); } outline(c, 1.1); }
    barrel(c, S * 0.28, S * 0.9); crate(c, S * 0.74, S * 0.92); m.flagAt = [0.5, 0.3];
  } else if (kind === 'abbey') {
    place(S * 0.08, S * 0.86, S * 0.26, 1);
    const bx = S * 0.4, bw = S * 0.46, by = S * 0.82, bh = S * 0.3;
    stones(c, bx, by - bh, bw, bh, '#d5cfbf', rnd, 14, 9); rr(c, bx, by - bh, bw, bh, 1); outline(c, 2);
    shingles(c, [[bx - 5, by - bh + 3], [bx + bw + 5, by - bh + 3], [bx + bw - 8, by - bh - S * 0.18], [bx + 8, by - bh - S * 0.18]], '#6b6f80', rnd, 8, 10);
    door(c, bx + bw * 0.38, by - S * 0.18, bw * 0.24, S * 0.18, true); window_(c, bx + 8, by - S * 0.22, 9, 16); window_(c, bx + bw - 17, by - S * 0.22, 9, 16);
    const tx = S * 0.28, tw = S * 0.14; stones(c, tx, S * 0.2, tw, S * 0.5, '#d5cfbf', rnd, 10, 9); c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(tx, S * 0.2, tw, S * 0.5);
    poly(c, [[tx - 4, S * 0.2], [tx + tw + 4, S * 0.2], [tx + tw / 2, S * 0.0]]); c.fillStyle = '#6b6f80'; c.fill(); outline(c, 2);
    c.fillStyle = '#d6b25a'; c.fillRect(tx + tw / 2 - 1, -S * 0.1, 2.4, S * 0.1); c.fillRect(tx + tw / 2 - 5, -S * 0.06, 10, 2.4);
    m.flagAt = [0.82, 0.4];
  } else if (kind === 'inn') {
    place(S * 0.08, S * 0.84, S * 0.24, 2);
    const g = house(c, rnd, { x: S * 0.34, y: S * 0.86, w: S * 0.5, wallH: S * 0.3, roofH: S * 0.3, roof: '#8c4a2a', plasterCol: '#dccaa0', depth: S * 0.1 });
    door(c, S * 0.52, S * 0.66, S * 0.1, S * 0.2, true); window_(c, S * 0.4, S * 0.66, S * 0.08, S * 0.1); window_(c, S * 0.68, S * 0.66, S * 0.08, S * 0.1); chimney(c, S * 0.7, g.ry - S * 0.06, S * 0.16, 10);
    c.strokeStyle = '#2d1d0e'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(S * 0.88, S * 0.55); c.lineTo(S * 0.88, S * 0.7); c.stroke(); c.fillStyle = '#d6b25a'; rr(c, S * 0.84, S * 0.7, S * 0.09, S * 0.08, 2); c.fill(); outline(c, 1.2);
    barrel(c, S * 0.3, S * 0.96); m.flagAt = [0.2, 0.34];
  } else { // hamlet: houses, a well and small fields
    place(S * 0.08, S * 0.76, S * 0.27, 0, true); place(S * 0.55, S * 0.74, S * 0.28, 1, true); place(S * 0.3, S * 0.96, S * 0.26, 2, true);
    c.fillStyle = '#a9c455'; for (let i = 0; i < 4; i++) c.fillRect(S * 0.72, S * (0.82 + i * 0.045), S * 0.26, 4);
    c.fillStyle = '#7a7468'; c.beginPath(); c.ellipse(S * 0.52, S * 0.88, 8, 5, 0, 0, 7); c.fill(); outline(c, 1.2); c.fillStyle = '#2f6c88'; c.beginPath(); c.ellipse(S * 0.52, S * 0.87, 5.5, 3, 0, 0, 7); c.fill();
    m.flagAt = [0.46, 0.3];
  }
  m.smoke = chims.slice(0, 2).map(([x, y]) => [x / S, y / S - 0.02]);
  // flag pole (pennant is drawn live, in the owner's colour)
  const [fx, fy] = m.flagAt || [0.5, 0.3];
  pole(c, S * fx, S * fy, S * 0.34); m.flag = [fx, fy];
  s = { cv, rise, S, meta: m }; vCache.set(key, s); return s;
}

// ---------------------------------------------------------------------------------------------- units
const uCache = new Map();
const SKIN = '#e0b88a';
function limb(c, x0, y0, x1, y1, w, col) { c.strokeStyle = INK; c.lineWidth = w + 2.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
function person(c, cx, fy, o) {
  const sw = o.swing || 0, bob = Math.abs(sw) * -1.6;
  const hipY = fy - 22 + bob, shY = fy - 40 + bob;
  const legs = o.legs || '#4a3a2a';
  // back leg / front leg
  limb(c, cx - 1, hipY, cx - 1 - sw * 8, fy - 2, 6, darken(legs, 0.2));
  limb(c, cx + 1, hipY, cx + 1 + sw * 8, fy - 2, 6, legs);
  c.fillStyle = '#2a1a0e'; c.beginPath(); c.ellipse(cx - 1 - sw * 8 + 2, fy - 1, 4.2, 2.4, 0, 0, 7); c.ellipse(cx + 1 + sw * 8 + 2, fy - 1, 4.2, 2.4, 0, 0, 7); c.fill();
  // back arm
  const armSw = o.armSw ?? -sw * 6;
  if (o.behind) o.behind(c, cx, shY);
  limb(c, cx - 3, shY + 3, cx - 3 + armSw, shY + 15, 5, darken(o.sleeve || o.tunic, 0.25));
  // torso
  const long = o.robe;
  c.fillStyle = o.tunic; c.beginPath();
  if (long) { c.moveTo(cx - 10, shY); c.lineTo(cx + 10, shY); c.lineTo(cx + 12, fy - 4); c.lineTo(cx - 12, fy - 4); } else { c.moveTo(cx - 9, shY); c.lineTo(cx + 9, shY); c.lineTo(cx + 8, hipY + 3); c.lineTo(cx - 8, hipY + 3); }
  c.closePath(); c.fill(); outline(c, 2);
  c.fillStyle = grad(c, cx - 9, 0, cx + 9, 0, 'rgba(255,255,255,.18)', 'rgba(0,0,0,.25)'); c.fill();
  if (o.trim) { c.fillStyle = o.trim; c.fillRect(cx - 9, shY + 1, 18, 3); if (long) c.fillRect(cx - 12, fy - 7, 24, 3); }
  c.fillStyle = '#3a2a1a'; c.fillRect(cx - 9, hipY - 2, 18, 3.2);
  if (o.cape) { c.fillStyle = o.cape; poly(c, [[cx - 8, shY], [cx - 15, hipY + 8], [cx - 9, hipY + 12], [cx - 3, shY + 6]]); c.fill(); outline(c, 1.6); }
  // head
  const hy = shY - 8;
  c.fillStyle = SKIN; c.beginPath(); c.arc(cx + 1.5, hy, 7, 0, 7); c.fill(); outline(c, 1.8);
  if (o.beard) { c.fillStyle = o.beard; c.beginPath(); c.arc(cx + 3, hy + 3, 5.5, 0.1, Math.PI - 0.1); c.fill(); }
  c.fillStyle = INK; c.fillRect(cx + 4.4, hy - 1, 1.8, 1.8);
  if (o.hair) { c.fillStyle = o.hair; c.beginPath(); c.arc(cx, hy - 2, 7, Math.PI * 1.05, Math.PI * 1.95); c.fill(); }
  if (o.hat === 'helm') { c.fillStyle = '#a9adb5'; c.beginPath(); c.arc(cx + 1.5, hy - 1, 8, Math.PI, 0); c.lineTo(cx + 9.5, hy + 5); c.lineTo(cx - 6.5, hy + 5); c.closePath(); c.fill(); outline(c, 1.8); c.fillStyle = '#1b130b'; c.fillRect(cx + 3, hy - 1, 6, 2); c.fillStyle = o.plume || 'transparent'; c.beginPath(); c.ellipse(cx - 3, hy - 9, 3, 5, -0.4, 0, 7); c.fill(); }
  else if (o.hat === 'hood') { c.fillStyle = o.hood; c.beginPath(); c.arc(cx + 0.5, hy - 0.5, 8.5, Math.PI * 0.85, Math.PI * 2.1); c.lineTo(cx + 9, hy + 5); c.lineTo(cx - 8, hy + 6); c.closePath(); c.fill(); outline(c, 1.8); c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.ellipse(cx + 4.5, hy + 0.5, 4.2, 5, 0, 0, 7); c.fill(); c.fillStyle = SKIN; c.beginPath(); c.arc(cx + 4.5, hy + 2, 3.2, 0, 7); c.fill(); }
  else if (o.hat === 'cap') { c.fillStyle = o.hood || '#6a5a3a'; c.beginPath(); c.arc(cx + 1.5, hy - 3, 7.5, Math.PI, 0); c.closePath(); c.fill(); outline(c, 1.6); c.fillRect(cx - 7, hy - 3, 18, 2.6); }
  else if (o.hat === 'straw') { c.fillStyle = '#d8b650'; c.beginPath(); c.ellipse(cx + 1.5, hy - 4, 11, 3.4, 0, 0, 7); c.fill(); outline(c, 1.4); c.beginPath(); c.arc(cx + 1.5, hy - 4, 6, Math.PI, 0); c.fill(); outline(c, 1.4); }
  // front arm + held items
  const ax = cx + 3 + (o.armFx || 0), ay = shY + 15 + (o.armFy || 0);
  limb(c, cx + 3, shY + 3, ax, ay, 5.4, o.sleeve || o.tunic);
  c.fillStyle = SKIN; c.beginPath(); c.arc(ax, ay, 3, 0, 7); c.fill(); outline(c, 1.2);
  if (o.front) o.front(c, ax, ay, cx, shY, hipY);
}
const teamTunic = (f) => f.primary;

function paintUnit(kind, team, frame, c) {
  const f = HOUSES[team] || HOUSES[0];
  const phases = [0, 0.8, 0, -0.8];
  const walk = frame < 4;
  const sw = walk ? phases[frame] : 0;
  const atk = frame >= 4 ? frame - 4 : -1; // 0 = wind-up, 1 = strike
  const cx = 32, fy = 62;
  const D = darken(f.primary, 0.3);
  if (kind === 'serf') {
    person(c, cx, fy, {
      swing: sw, tunic: '#8a7656', trim: f.primary, legs: '#5c4a32', hair: '#4a3420', hat: 'cap', hood: '#7a6a48', armFx: atk === 1 ? 14 : 5, armFy: atk === 1 ? 10 : -12,
      front: (c2, ax, ay) => { const a = atk === 1 ? 0.9 : -0.5; c2.save(); c2.translate(ax, ay); c2.rotate(a); c2.strokeStyle = '#5a3d1f'; c2.lineWidth = 3; c2.beginPath(); c2.moveTo(-3, 6); c2.lineTo(2, -22); c2.stroke(); c2.fillStyle = '#9a9a9a'; c2.beginPath(); c2.moveTo(-9, -21); c2.quadraticCurveTo(2, -28, 13, -20); c2.lineTo(11, -18); c2.quadraticCurveTo(2, -23, -7, -18); c2.closePath(); c2.fill(); outline(c2, 1.2); c2.restore(); },
    });
  } else if (kind === 'scout') {
    person(c, cx, fy, {
      swing: sw * 1.3, tunic: '#6e5b3a', cape: f.primary, trim: f.accent, legs: '#4a3a2a', hat: 'hood', hood: f.primary, armFx: atk === 1 ? 16 : 7, armFy: atk === 1 ? 4 : 2,
      front: (c2, ax, ay) => { c2.strokeStyle = '#cfd3d8'; c2.lineWidth = 2.4; c2.beginPath(); c2.moveTo(ax, ay); c2.lineTo(ax + 10, ay - 3); c2.stroke(); outline(c2, 0.6); },
    });
  } else if (kind === 'footman') {
    person(c, cx, fy, {
      swing: sw, tunic: '#7d8088', sleeve: '#6a6d75', trim: f.primary, legs: '#4a4d55', hat: 'helm', plume: f.primary, armFx: atk === 1 ? 15 : 6, armFy: atk === 1 ? -4 : -10,
      behind: (c2, x, y) => { c2.fillStyle = f.primary; c2.beginPath(); c2.moveTo(x - 10, y + 22); c2.lineTo(x - 5, y + 40); c2.lineTo(x - 15, y + 38); c2.closePath(); },
      front: (c2, ax, ay, x, shY) => {
        c2.save(); c2.translate(ax, ay); c2.rotate(atk === 1 ? 0.55 : -0.35); c2.fillStyle = '#d8dce2'; c2.fillRect(-1.6, -22, 3.2, 22); outline(c2, 1); c2.fillStyle = '#6a4a28'; c2.fillRect(-5, -2, 10, 3); c2.restore();
        c2.fillStyle = f.primary; c2.beginPath(); c2.arc(x - 6, shY + 16, 10, 0, 7); c2.fill(); outline(c2, 1.8); c2.fillStyle = f.accent; c2.beginPath(); c2.arc(x - 6, shY + 16, 3.6, 0, 7); c2.fill();
      },
    });
  } else if (kind === 'bowman') {
    person(c, cx, fy, {
      swing: sw, tunic: '#5f6a3a', trim: f.primary, legs: '#4a3a2a', hat: 'hood', hood: f.primary, cape: darken(f.primary, 0.1), armFx: atk === 0 ? 10 : 11, armFy: atk === 0 ? -12 : -12,
      front: (c2, ax, ay) => {
        c2.strokeStyle = '#6a4a28'; c2.lineWidth = 3; c2.beginPath(); c2.arc(ax + 2, ay + 2, 15, -1.2, 1.2); c2.stroke();
        c2.strokeStyle = '#e8e0c8'; c2.lineWidth = 1; c2.beginPath(); const px = ax + 2 + Math.cos(1.2) * 15, py = ay + 2 + Math.sin(1.2) * 15, qx = ax + 2 + Math.cos(-1.2) * 15, qy = ay + 2 + Math.sin(-1.2) * 15; c2.moveTo(qx, qy); c2.lineTo(atk === 0 ? ax - 6 : ax + 3, ay + 2); c2.lineTo(px, py); c2.stroke();
        if (atk === 0) { c2.strokeStyle = '#d6c28a'; c2.lineWidth = 1.6; c2.beginPath(); c2.moveTo(ax - 6, ay + 2); c2.lineTo(ax + 16, ay + 2); c2.stroke(); }
      },
      behind: (c2, x, y) => { c2.fillStyle = '#5a3d1f'; c2.save(); c2.translate(x - 8, y + 6); c2.rotate(-0.5); c2.fillRect(-3, -4, 6, 20); c2.restore(); c2.strokeStyle = '#d6c28a'; c2.lineWidth = 1.2; for (let i = 0; i < 3; i++) { c2.beginPath(); c2.moveTo(x - 11 + i * 2, y + 1); c2.lineTo(x - 13 + i * 2, y - 4); c2.stroke(); } },
    });
  } else if (kind === 'spy') {
    person(c, cx, fy, {
      swing: sw * 1.2, tunic: '#2c2833', trim: f.accent, cape: '#1d1a23', legs: '#211e28', hat: 'hood', hood: '#26222d', armFx: atk === 1 ? 15 : 5, armFy: atk === 1 ? 2 : 2,
      front: (c2, ax, ay) => { c2.strokeStyle = '#cfd3d8'; c2.lineWidth = 2.2; c2.beginPath(); c2.moveTo(ax, ay); c2.lineTo(ax + 9, ay + 3); c2.stroke(); },
    });
  } else if (kind === 'scholar') {
    person(c, cx, fy, {
      swing: sw * 0.5, tunic: '#e4dcc4', trim: f.primary, robe: true, legs: '#cfc6aa', hat: 'cap', hood: f.primary, beard: '#d8d4cc', armFx: 6, armFy: -4,
      front: (c2, ax, ay) => { c2.fillStyle = '#7a3a2a'; c2.save(); c2.translate(ax + 2, ay - 2); c2.rotate(-0.2); c2.fillRect(-1, -7, 12, 14); c2.restore(); c2.fillStyle = '#e8dcc0'; c2.fillRect(ax + 2, ay - 8, 9, 11); c2.strokeStyle = INK; c2.lineWidth = 1.1; c2.strokeRect(ax + 2, ay - 8, 9, 11); },
    });
  }
}
function paintMounted(kind, team, frame, c) {
  const f = HOUSES[team] || HOUSES[0];
  const cx = 56, fy = 62, g = frame < 4 ? [0, 1, 0, -1][frame] : 0, atk = frame >= 4 ? frame - 4 : -1;
  const horse = kind === 'knight' ? '#4a3a30' : '#8a6a44';
  // legs
  for (const [dx, ph, back] of [[-14, g, true], [-8, -g, true], [12, -g, false], [18, g, false]]) {
    const x = cx + dx; limb(c, x, fy - 22, x + ph * 7, fy - 2 - (ph > 0 ? 4 : 0), 6, back ? darken(horse, 0.2) : horse);
  }
  // body, neck, head, tail
  c.fillStyle = horse; c.beginPath(); c.ellipse(cx, fy - 26, 24, 11, 0, 0, 7); c.fill(); outline(c, 2);
  c.beginPath(); c.moveTo(cx + 14, fy - 32); c.lineTo(cx + 26, fy - 48); c.lineTo(cx + 34, fy - 44); c.lineTo(cx + 24, fy - 26); c.closePath(); c.fill(); outline(c, 2);
  c.beginPath(); c.ellipse(cx + 34, fy - 44, 8, 5, 0.5, 0, 7); c.fill(); outline(c, 1.8);
  c.fillStyle = '#1b130b'; c.fillRect(cx + 33, fy - 49, 2, 2);
  c.strokeStyle = darken(horse, 0.4); c.lineWidth = 3; c.beginPath(); c.moveTo(cx - 22, fy - 30); c.quadraticCurveTo(cx - 32, fy - 28, cx - 30, fy - 12); c.stroke();
  c.strokeStyle = darken(horse, 0.4); c.beginPath(); c.moveTo(cx + 16, fy - 38); c.lineTo(cx + 24, fy - 50); c.stroke();
  // blanket
  c.fillStyle = f.primary; poly(c, [[cx - 10, fy - 36], [cx + 8, fy - 36], [cx + 10, fy - 22], [cx - 12, fy - 22]]); c.fill(); outline(c, 1.6); c.fillStyle = f.accent; c.fillRect(cx - 12, fy - 24, 22, 2.4);
  // rider
  const ry = fy - 34;
  c.fillStyle = kind === 'knight' ? '#7d8088' : '#6e5b3a'; poly(c, [[cx - 8, ry - 18], [cx + 6, ry - 18], [cx + 7, ry], [cx - 7, ry]]); c.fill(); outline(c, 2);
  c.fillStyle = f.primary; c.fillRect(cx - 8, ry - 18, 14, 3);
  limb(c, cx, ry, cx + 8, ry + 12, 5, '#4a4d55');
  c.fillStyle = SKIN; c.beginPath(); c.arc(cx, ry - 25, 6.5, 0, 7); c.fill(); outline(c, 1.8);
  if (kind === 'knight') {
    c.fillStyle = '#a9adb5'; c.beginPath(); c.arc(cx, ry - 26, 8, Math.PI, 0); c.lineTo(cx + 8, ry - 20); c.lineTo(cx - 8, ry - 20); c.closePath(); c.fill(); outline(c, 1.8); c.fillStyle = '#1b130b'; c.fillRect(cx + 1, ry - 27, 7, 2);
    c.fillStyle = f.primary; c.beginPath(); c.ellipse(cx - 3, ry - 36, 3, 5.5, -0.4, 0, 7); c.fill();
    c.fillStyle = f.primary; c.beginPath(); c.moveTo(cx - 14, ry - 12); c.lineTo(cx - 3, ry - 12); c.lineTo(cx - 3, ry + 4); c.lineTo(cx - 8.5, ry + 10); c.lineTo(cx - 14, ry + 4); c.closePath(); c.fill(); outline(c, 1.8); c.fillStyle = f.accent; c.beginPath(); c.arc(cx - 8.5, ry - 3, 3, 0, 7); c.fill();
    const tilt = atk === 1 ? -0.1 : -0.55;
    c.save(); c.translate(cx + 6, ry - 6); c.rotate(tilt); c.fillStyle = '#6a4a28'; c.fillRect(-4, -2, 56, 3.4); c.fillStyle = '#d8dce2'; poly(c, [[52, -3], [64, -0.5], [52, 2]]); c.fill(); outline(c, 1); c.fillStyle = f.primary; poly(c, [[44, -2], [44, 6], [36, 2]]); c.fill(); c.restore();
  } else {
    c.fillStyle = f.primary; c.beginPath(); c.arc(cx - 0.5, ry - 26, 8, Math.PI * 0.9, Math.PI * 2.1); c.lineTo(cx + 8, ry - 21); c.lineTo(cx - 8, ry - 20); c.closePath(); c.fill(); outline(c, 1.6);
    c.strokeStyle = '#cfd3d8'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(cx + 8, ry + 8); c.lineTo(cx + 24, ry - (atk === 1 ? 4 : 10)); c.stroke();
  }
  c.fillStyle = SKIN; c.beginPath(); c.arc(cx + 8, ry + 12, 3, 0, 7); c.fill();
}
function paintRam(team, frame, c) {
  const f = HOUSES[team] || HOUSES[0], bob = frame < 4 ? Math.sin(frame * 1.6) * 1.2 : 0, atk = frame >= 4 ? frame - 4 : -1, cx = 56, fy = 62;
  const push = atk === 0 ? -6 : atk === 1 ? 8 : 0;
  c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(cx, fy - 1, 30, 6, 0, 0, 7); c.fill();
  // roof frame
  planks(c, cx - 26, fy - 38 + bob, 52, 18, '#6a4a28', seeded(5), true); c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(cx - 26, fy - 38 + bob, 52, 18);
  shingles(c, [[cx - 30, fy - 36 + bob], [cx + 30, fy - 36 + bob], [cx + 22, fy - 52 + bob], [cx - 22, fy - 52 + bob]], '#7a5a3a', seeded(6), 7, 9);
  c.fillStyle = f.primary; poly(c, [[cx - 6, fy - 50 + bob], [cx + 6, fy - 50 + bob], [cx + 6, fy - 38 + bob], [cx, fy - 34 + bob], [cx - 6, fy - 38 + bob]]); c.fill(); outline(c, 1.4);
  // log
  c.fillStyle = '#5a3a1c'; rr(c, cx - 28 + push, fy - 24 + bob, 66, 8, 4); c.fill(); outline(c, 1.8);
  c.fillStyle = '#8a8d94'; poly(c, [[cx + 36 + push, fy - 26 + bob], [cx + 46 + push, fy - 20 + bob], [cx + 36 + push, fy - 14 + bob]]); c.fill(); outline(c, 1.6);
  // wheels
  for (const dx of [-18, 16]) { c.fillStyle = '#4a2f18'; c.beginPath(); c.arc(cx + dx, fy - 8, 8, 0, 7); c.fill(); outline(c, 1.8); c.strokeStyle = '#8a6636'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(cx + dx - 6, fy - 8); c.lineTo(cx + dx + 6, fy - 8); c.moveTo(cx + dx, fy - 14); c.lineTo(cx + dx, fy - 2); c.stroke(); }
}

export const FRAMES = { walk: 4, attack: 2 };
export function unitSprite(kind, team, frame) {
  const key = kind + '|' + team + '|' + frame; let s = uCache.get(key); if (s) return s;
  const mounted = kind === 'knight' || kind === 'ram';
  const cv = mk(mounted ? 112 : 64, 96), c = cv.getContext('2d');
  c.translate(0, 24);
  if (kind === 'knight') paintMounted(kind, team, frame, c); else if (kind === 'ram') paintRam(team, frame, c); else paintUnit(kind, team, frame, c);
  s = { cv, ax: cv.width / 2, ay: 86 }; uCache.set(key, s); return s;
}
