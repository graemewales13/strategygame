// Seven Holds - canvas drawing. Reads game state, never changes it.
import {
  TILE, PLAYER, HOUSES, T_GRASS, T_DIRT, T_WATER, T_FORD, UNITS, BUILDINGS, NODE_RES, TERRITORY, VILLAGE_KINDS,
} from './config.js';

const hash = (x, y) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
const GRASS = ['#4d7b3b', '#527f3e', '#4a7637', '#578440'];
const GOLD = '#e2c15e';

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = 0; this.h = 0;
    this.resize();
  }
  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.w = Math.max(200, Math.floor(r.width));
    this.h = Math.max(200, Math.floor(r.height));
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
  }
  get P() { return TILE * this.cam.zoom; }
  toWorld(sx, sy) { return [this.cam.x + sx / this.P, this.cam.y + sy / this.P]; }
  toScreen(x, y) { return [(x - this.cam.x) * this.P, (y - this.cam.y) * this.P]; }
  clampCam() {
    const { game: g } = this, vw = this.w / this.P, vh = this.h / this.P;
    this.cam.x = Math.max(0, Math.min(Math.max(0, g.W - vw), this.cam.x));
    this.cam.y = Math.max(0, Math.min(Math.max(0, g.H - vh), this.cam.y));
  }
  centerOn(x, y) { this.cam.x = x - this.w / this.P / 2; this.cam.y = y - this.h / this.P / 2; this.clampCam(); }

  draw(ui) {
    const { ctx, game: g } = this;
    const P = this.P;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#06080b';
    ctx.fillRect(0, 0, this.w, this.h);
    const t = performance.now() / 1000;
    const x0 = Math.max(0, Math.floor(this.cam.x)), y0 = Math.max(0, Math.floor(this.cam.y));
    const x1 = Math.min(g.W, Math.ceil(this.cam.x + this.w / P) + 1), y1 = Math.min(g.H, Math.ceil(this.cam.y + this.h / P) + 1);
    const seen = g.seen[PLAYER], vis = g.vis[PLAYER];
    const isSeen = (x, y) => !g.fogOn || seen[Math.floor(y) * g.W + Math.floor(x)] === 1;
    const isVis = (x, y) => !g.fogOn || vis[Math.floor(y) * g.W + Math.floor(x)] === 1;

    // terrain
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * g.W + x;
      if (g.fogOn && !seen[i]) continue;
      const [sx, sy] = this.toScreen(x, y);
      this.tile(ctx, g, x, y, sx, sy, P, t);
    }
    // ownership glow under territory when placing
    if (ui?.placing) this.territory(ctx, g, P);

    // resource nodes
    for (const n of g.resources) {
      if (n.amount <= 0 || n.x < x0 - 1 || n.x > x1 || n.y < y0 - 1 || n.y > y1) continue;
      if (!isSeen(n.x, n.y)) continue;
      const [sx, sy] = this.toScreen(n.x, n.y);
      this.node(ctx, n, sx, sy, P, isVis(n.x, n.y));
    }

    // villages and buildings sorted by baseline
    const solids = [];
    for (const v of g.villages) if (isSeen(v.x, v.y)) solids.push(v);
    for (const b of g.buildings) if (b.team === PLAYER || isSeen(b.x, b.y)) solids.push(b);
    solids.sort((a, b) => a.ty + a.size - (b.ty + b.size));
    for (const e of solids) {
      if (e.tx + e.size < x0 - 1 || e.tx > x1 || e.ty + e.size < y0 - 1 || e.ty > y1) continue;
      const [sx, sy] = this.toScreen(e.tx, e.ty);
      const dim = !(e.team === PLAYER || e.owner === PLAYER) && !isVis(e.x, e.y);
      if (e.type === 'village') this.village(ctx, e, sx, sy, P, dim, ui);
      else this.building(ctx, e, sx, sy, P, dim, ui, t);
    }

    // units
    const us = g.units.filter((u) => u.hp > 0 && !u.hidden && (u.team === PLAYER || isVis(u.x, u.y))).sort((a, b) => a.y - b.y);
    for (const u of us) {
      if (u.x < x0 - 1 || u.x > x1 || u.y < y0 - 1 || u.y > y1) continue;
      const [sx, sy] = this.toScreen(u.x, u.y);
      this.unit(ctx, u, sx, sy, P, ui);
    }
    for (const u of g.units) u.hidden = false; // re-set each tick by infiltrators

    // projectiles
    ctx.strokeStyle = '#f3e2a0'; ctx.lineWidth = 2;
    for (const p of g.projectiles) {
      if (!isVis(p.x, p.y)) continue;
      const [sx, sy] = this.toScreen(p.x, p.y), a = p.ang || 0;
      ctx.beginPath(); ctx.moveTo(sx - Math.cos(a) * 7, sy - Math.sin(a) * 7); ctx.lineTo(sx, sy); ctx.stroke();
    }
    // floaters
    ctx.font = `bold ${Math.round(13 * Math.max(0.8, this.cam.zoom))}px Georgia, serif`;
    ctx.textAlign = 'center';
    const fcol = { food: '#e58aa3', wood: '#d1a066', gold: GOLD };
    for (const f of g.floaters) {
      const [sx, sy] = this.toScreen(f.x, f.y - f.age * 0.9);
      ctx.globalAlpha = Math.max(0, 1 - f.age / 1.3);
      ctx.fillStyle = '#000'; ctx.fillText(f.text, sx + 1, sy + 1);
      ctx.fillStyle = fcol[f.res] || '#fff'; ctx.fillText(f.text, sx, sy);
    }
    ctx.globalAlpha = 1;

    // fog overlay: remembered-but-dim
    if (g.fogOn) {
      ctx.fillStyle = 'rgba(5,7,11,0.52)';
      for (let y = y0; y < y1; y++) {
        let run = -1;
        for (let x = x0; x <= x1; x++) {
          const dim = x < x1 && seen[y * g.W + x] === 1 && vis[y * g.W + x] === 0;
          if (dim && run < 0) run = x;
          if (!dim && run >= 0) { const [sx, sy] = this.toScreen(run, y); ctx.fillRect(sx, sy, (x - run) * P + 1, P + 1); run = -1; }
        }
      }
    }

    if (ui?.placing) this.ghost(ctx, g, ui, P);
    if (ui?.dragBox) {
      const b = ui.dragBox;
      ctx.fillStyle = 'rgba(240,226,160,0.12)'; ctx.strokeStyle = '#f0e2a0'; ctx.lineWidth = 1;
      ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); ctx.strokeRect(b.x0 + 0.5, b.y0 + 0.5, b.x1 - b.x0, b.y1 - b.y0);
    }
    if (ui?.pings) for (const p of ui.pings) {
      const [sx, sy] = this.toScreen(p.x, p.y);
      ctx.strokeStyle = p.color; ctx.globalAlpha = Math.max(0, 1 - p.age / 0.8); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(sx, sy, P * (0.2 + p.age * 0.6), P * (0.1 + p.age * 0.3), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- terrain
  tile(ctx, g, x, y, sx, sy, P, t) {
    const type = g.terrain[y * g.W + x], h = hash(x, y), s = P + 1;
    if (type === T_WATER || type === T_FORD) {
      ctx.fillStyle = (x + y) & 1 ? '#2b6580' : '#2f6c88';
      ctx.fillRect(sx, sy, s, s);
      ctx.strokeStyle = 'rgba(190,225,240,0.18)'; ctx.lineWidth = 1;
      const w = Math.sin(t * 1.4 + x * 0.9 + y * 0.5) * P * 0.12;
      ctx.beginPath(); ctx.moveTo(sx + P * 0.2, sy + P * 0.35 + w); ctx.lineTo(sx + P * 0.55, sy + P * 0.35 + w);
      ctx.moveTo(sx + P * 0.4, sy + P * 0.75 - w); ctx.lineTo(sx + P * 0.8, sy + P * 0.75 - w); ctx.stroke();
      if (type === T_WATER) {
        ctx.fillStyle = '#c9b27a';
        const nb = (dx, dy) => { const xx = x + dx, yy = y + dy; return xx >= 0 && yy >= 0 && xx < g.W && yy < g.H && g.terrain[yy * g.W + xx] !== T_WATER && g.terrain[yy * g.W + xx] !== T_FORD; };
        const e = Math.max(2, P * 0.1);
        if (nb(0, -1)) ctx.fillRect(sx, sy, s, e);
        if (nb(0, 1)) ctx.fillRect(sx, sy + P - e, s, e);
        if (nb(-1, 0)) ctx.fillRect(sx, sy, e, s);
        if (nb(1, 0)) ctx.fillRect(sx + P - e, sy, e, s);
      } else {
        ctx.fillStyle = '#7a5530'; ctx.fillRect(sx, sy + P * 0.08, s, P * 0.84);
        ctx.strokeStyle = '#4e331a'; ctx.lineWidth = 1;
        for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(sx, sy + P * 0.08 + (P * 0.84 * k) / 4); ctx.lineTo(sx + P, sy + P * 0.08 + (P * 0.84 * k) / 4); ctx.stroke(); }
        ctx.fillStyle = '#5c3f21'; ctx.fillRect(sx, sy + P * 0.04, s, P * 0.06); ctx.fillRect(sx, sy + P * 0.9, s, P * 0.06);
      }
      return;
    }
    if (type === T_DIRT) {
      ctx.fillStyle = h < 0.5 ? '#8d6c3d' : '#876738'; ctx.fillRect(sx, sy, s, s);
      if (h > 0.8) { ctx.fillStyle = 'rgba(60,40,18,0.35)'; ctx.fillRect(sx + h * P * 0.6, sy + P * 0.5, P * 0.12, P * 0.08); }
      return;
    }
    ctx.fillStyle = GRASS[(h * 4) | 0]; ctx.fillRect(sx, sy, s, s);
    if (h > 0.72) {
      ctx.strokeStyle = 'rgba(30,60,25,0.55)'; ctx.lineWidth = 1;
      const a = sx + h * 40 % P, b = sy + (h * 97 % 1) * P;
      ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(a - 2, b - P * 0.18); ctx.moveTo(a + 3, b); ctx.lineTo(a + 3, b - P * 0.22); ctx.stroke();
    } else if (h < 0.04) {
      ctx.fillStyle = h < 0.02 ? '#e8d86a' : '#e8e8f0'; ctx.fillRect(sx + P * 0.5, sy + P * 0.5, 3, 3);
    }
  }

  territory(ctx, g, P) {
    ctx.save();
    ctx.lineWidth = 2; ctx.setLineDash([8, 8]); ctx.strokeStyle = 'rgba(244,220,122,0.55)'; ctx.fillStyle = 'rgba(244,220,122,0.05)';
    for (const b of g.buildings) {
      if (b.team !== PLAYER || b.built < 1 || !TERRITORY[b.kind]) continue;
      const [sx, sy] = this.toScreen(b.x, b.y);
      ctx.beginPath(); ctx.arc(sx, sy, TERRITORY[b.kind] * P, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- resources
  node(ctx, n, sx, sy, P, vis) {
    const dim = vis ? 1 : 0.6;
    ctx.save(); ctx.globalAlpha = dim;
    if (n.kind === 'tree') {
      const hh = hash(n.x, n.y), s = 0.85 + hh * 0.25;
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(sx + P * 0.52, sy + P * 0.9, P * 0.3, P * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a3a1a'; ctx.fillRect(sx + P * 0.45, sy + P * 0.68, P * 0.1, P * 0.24);
      const col = ['#1f4a24', '#25552a', '#1c4421'][(hh * 3) | 0];
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = k === 2 ? '#2f6a33' : col;
        const w = P * (0.62 - k * 0.12) * s, top = sy + P * (0.05 + k * 0.2) * s + P * 0.05;
        ctx.beginPath(); ctx.moveTo(sx + P * 0.5, top); ctx.lineTo(sx + P * 0.5 + w / 2, top + P * 0.34); ctx.lineTo(sx + P * 0.5 - w / 2, top + P * 0.34); ctx.closePath(); ctx.fill();
      }
    } else if (n.kind === 'gold') {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(sx + P * 0.5, sy + P * 0.85, P * 0.4, P * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7b7468'; ctx.beginPath(); ctx.moveTo(sx + P * 0.1, sy + P * 0.85); ctx.lineTo(sx + P * 0.3, sy + P * 0.25); ctx.lineTo(sx + P * 0.62, sy + P * 0.18); ctx.lineTo(sx + P * 0.92, sy + P * 0.85); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#9a9283'; ctx.beginPath(); ctx.moveTo(sx + P * 0.3, sy + P * 0.25); ctx.lineTo(sx + P * 0.62, sy + P * 0.18); ctx.lineTo(sx + P * 0.55, sy + P * 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = GOLD;
      for (const [a, b] of [[0.38, 0.62], [0.58, 0.5], [0.7, 0.72], [0.28, 0.76]]) { ctx.beginPath(); ctx.arc(sx + P * a, sy + P * b, P * 0.07, 0, Math.PI * 2); ctx.fill(); }
    } else {
      ctx.fillStyle = '#2e5a2b'; ctx.beginPath(); ctx.ellipse(sx + P * 0.5, sy + P * 0.62, P * 0.38, P * 0.28, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3d7438'; ctx.beginPath(); ctx.ellipse(sx + P * 0.45, sy + P * 0.55, P * 0.3, P * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b0344f';
      for (const [a, b] of [[0.3, 0.5], [0.5, 0.42], [0.62, 0.62], [0.4, 0.68], [0.72, 0.5]]) { ctx.beginPath(); ctx.arc(sx + P * a, sy + P * b, P * 0.055, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- villages
  village(ctx, v, sx, sy, P, dim, ui) {
    const S = v.size * P, f = v.owner >= 0 ? HOUSES[v.owner] : null;
    const prim = f ? f.primary : '#9a8860';
    ctx.save();
    if (dim) ctx.globalAlpha = 0.7;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(sx + 3, sy + S * 0.12, S, S * 0.9);
    // palisade ring + cottages (hillfort gets stone walls and a keep tower)
    ctx.fillStyle = v.kind === 'hillfort' ? '#6f6a60' : '#5a4128'; ctx.fillRect(sx, sy + S * 0.05, S, S * 0.92);
    ctx.fillStyle = v.kind === 'hillfort' ? '#8a8578' : '#7a6035'; ctx.fillRect(sx + S * 0.06, sy + S * 0.11, S * 0.88, S * 0.8);
    const roof = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h * 0.6); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, y + h * 0.6, w, h * 0.4); ctx.fillStyle = '#e8d7a8'; ctx.fillRect(x, y + h * 0.58, w, 2); };
    roof(sx + S * 0.12, sy + S * 0.2, S * 0.3, S * 0.28, '#a2562f');
    roof(sx + S * 0.55, sy + S * 0.18, S * 0.3, S * 0.3, '#8c4a2a');
    roof(sx + S * 0.3, sy + S * 0.55, S * 0.36, S * 0.3, '#b36a3a');
    switch (v.kind) {
      case 'mine': ctx.fillStyle = '#1e1a14'; ctx.fillRect(sx + S * 0.68, sy + S * 0.6, S * 0.2, S * 0.24); ctx.fillStyle = GOLD; ctx.fillRect(sx + S * 0.7, sy + S * 0.62, S * 0.06, S * 0.06); break;
      case 'market': ctx.fillStyle = '#c33'; ctx.fillRect(sx + S * 0.1, sy + S * 0.6, S * 0.18, S * 0.1); ctx.fillStyle = '#eee'; ctx.fillRect(sx + S * 0.28, sy + S * 0.6, S * 0.18, S * 0.1); break;
      case 'hillfort': ctx.fillStyle = '#b8b2a2'; ctx.fillRect(sx + S * 0.38, sy + S * 0.3, S * 0.26, S * 0.34); for (let k = 0; k < 3; k++) ctx.fillRect(sx + S * (0.38 + k * 0.1), sy + S * 0.26, S * 0.06, S * 0.05); break;
      case 'abbey': ctx.fillStyle = '#e8e2cf'; ctx.fillRect(sx + S * 0.62, sy + S * 0.5, S * 0.22, S * 0.3); ctx.fillStyle = '#6b6b78'; ctx.beginPath(); ctx.moveTo(sx + S * 0.6, sy + S * 0.5); ctx.lineTo(sx + S * 0.73, sy + S * 0.28); ctx.lineTo(sx + S * 0.86, sy + S * 0.5); ctx.fill(); break;
      case 'inn': ctx.fillStyle = '#d6b25a'; ctx.fillRect(sx + S * 0.78, sy + S * 0.52, S * 0.05, S * 0.18); ctx.fillStyle = '#6a3a1a'; ctx.fillRect(sx + S * 0.7, sy + S * 0.5, S * 0.16, S * 0.1); break;
      default: ctx.fillStyle = '#7a9a3a'; ctx.fillRect(sx + S * 0.62, sy + S * 0.55, S * 0.26, S * 0.26); // field
    }
    // banner pole
    ctx.fillStyle = '#d8cba2'; ctx.fillRect(sx + S * 0.47, sy - S * 0.22, 2, S * 0.4);
    ctx.fillStyle = prim; ctx.fillRect(sx + S * 0.47 + 2, sy - S * 0.2, S * 0.2, S * 0.14);
    if (f) { ctx.strokeStyle = f.accent; ctx.lineWidth = 2; ctx.strokeRect(sx + 1, sy + S * 0.05, S - 2, S * 0.92); }
    if (v.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${v.flash})`; ctx.fillRect(sx, sy, S, S); }
    ctx.restore();
    // bars: protection (red), loyalty (blue)
    this.bar(ctx, sx, sy - 7, S, 4, v.protection / v.maxProtection, '#c0473b');
    this.bar(ctx, sx, sy - 2, S, 4, v.loyalty / 100, '#5a9ad8');
    if (ui?.isSelected(v)) { ctx.strokeStyle = '#f0e2a0'; ctx.lineWidth = 2; ctx.strokeRect(sx - 3, sy - 3, S + 6, S + 6); }
    if (P > 20) { ctx.font = `${Math.round(11 * this.cam.zoom + 2)}px Georgia, serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#000'; ctx.fillText(v.name, sx + S / 2 + 1, sy + S + 14); ctx.fillStyle = '#f0e2b6'; ctx.fillText(v.name, sx + S / 2, sy + S + 13); }
  }

  // ---------------------------------------------------------------- buildings
  building(ctx, b, sx, sy, P, dim, ui, t) {
    const S = b.size * P, f = HOUSES[b.team], k = b.kind;
    const prog = b.built;
    ctx.save();
    if (dim) ctx.globalAlpha = 0.72;
    ctx.fillStyle = 'rgba(0,0,0,0.26)'; ctx.fillRect(sx + 4, sy + S * 0.12, S, S * 0.9);
    if (k === 'farm') {
      ctx.fillStyle = '#6b4a28'; ctx.fillRect(sx, sy, S, S);
      for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? '#8aa83f' : '#a9c455'; ctx.fillRect(sx + S * 0.07, sy + S * (0.08 + i * 0.17), S * 0.86, S * 0.11); }
      ctx.fillStyle = f.primary; ctx.fillRect(sx, sy, S, 3);
    } else if (k === 'keep' || k === 'tower') {
      const stone = '#9b968a', dk = '#6f6b62';
      ctx.fillStyle = dk; ctx.fillRect(sx, sy + S * 0.04, S, S * 0.94);
      ctx.fillStyle = stone; ctx.fillRect(sx + S * 0.05, sy + S * 0.09, S * 0.9, S * 0.84);
      ctx.fillStyle = f.dark; ctx.fillRect(sx + S * 0.22, sy + S * 0.24, S * 0.56, S * 0.52);
      ctx.fillStyle = f.primary; ctx.fillRect(sx + S * 0.28, sy + S * 0.3, S * 0.44, S * 0.4);
      const cr = S * 0.09; ctx.fillStyle = stone;
      for (let i = 0; i < (k === 'keep' ? 5 : 3); i++) { const q = (S - cr) * (i / (k === 'keep' ? 4 : 2)); ctx.fillRect(sx + q, sy - cr * 0.4, cr, cr); }
      if (k === 'keep') for (const [a, c] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { ctx.fillStyle = dk; ctx.fillRect(sx + a * (S - S * 0.2), sy + c * (S - S * 0.2), S * 0.2, S * 0.2); }
      ctx.fillStyle = f.accent; ctx.fillRect(sx + S * 0.47, sy - S * 0.2, 2, S * 0.3); ctx.fillRect(sx + S * 0.47 + 2, sy - S * 0.2, S * 0.2, S * 0.12);
      if (k === 'tower') { ctx.strokeStyle = '#2a2824'; ctx.strokeRect(sx + S * 0.38, sy + S * 0.4, S * 0.24, S * 0.34); }
    } else {
      // timber walls + roof in house colour
      ctx.fillStyle = '#4b3320'; ctx.fillRect(sx, sy + S * 0.04, S, S * 0.94);
      ctx.fillStyle = k === 'warehouse' ? '#7b6240' : '#6b4a2b'; ctx.fillRect(sx + S * 0.04, sy + S * 0.08, S * 0.92, S * 0.86);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(sx + S * 0.04, sy + S * (0.08 + i * 0.14)); ctx.lineTo(sx + S * 0.96, sy + S * (0.08 + i * 0.14)); ctx.stroke(); }
      const rh = S * (k === 'hall' ? 0.58 : 0.5);
      ctx.fillStyle = f.primary; ctx.fillRect(sx - S * 0.02, sy - S * 0.02, S * 1.04, rh);
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(sx - S * 0.02, sy - S * 0.02 + rh * 0.5, S * 1.04, rh * 0.5);
      ctx.fillStyle = f.accent; ctx.fillRect(sx - S * 0.02, sy - S * 0.02 + rh * 0.48, S * 1.04, 2);
      ctx.fillStyle = '#2a1a0c'; ctx.fillRect(sx + S * 0.42, sy + S * 0.7, S * 0.16, S * 0.22);
      const cx = sx + S / 2, cy = sy + rh + S * 0.1;
      const glyph = {
        hall: () => { ctx.fillStyle = f.accent; ctx.fillRect(cx - 1, sy - S * 0.28, 2, S * 0.3); ctx.fillRect(cx + 1, sy - S * 0.28, S * 0.22, S * 0.14); },
        mill: () => { ctx.strokeStyle = '#e6d8b0'; ctx.lineWidth = 3; ctx.save(); ctx.translate(cx, sy + S * 0.3); ctx.rotate(t * 0.8); for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -S * 0.42); ctx.stroke(); } ctx.restore(); },
        forge: () => { ctx.fillStyle = '#2b2b2e'; ctx.fillRect(sx + S * 0.72, sy - S * 0.2, S * 0.14, S * 0.3); ctx.fillStyle = `rgba(255,${120 + Math.sin(t * 7) * 40 | 0},40,0.9)`; ctx.fillRect(sx + S * 0.15, cy, S * 0.2, S * 0.12); },
        market: () => { for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? '#f0e8d0' : '#b84a3a'; ctx.fillRect(sx + S * (0.08 + i * 0.17), cy - S * 0.02, S * 0.17, S * 0.1); } },
        tavern: () => { ctx.fillStyle = '#d6b25a'; ctx.fillRect(sx + S * 0.78, cy - S * 0.05, S * 0.1, S * 0.16); },
        academy: () => { ctx.fillStyle = '#ede2c0'; ctx.beginPath(); ctx.arc(cx, sy + S * 0.12, S * 0.2, Math.PI, 0); ctx.fill(); },
        temple: () => { ctx.fillStyle = '#efe4c4'; for (let i = 0; i < 3; i++) ctx.fillRect(sx + S * (0.2 + i * 0.25), cy, S * 0.1, S * 0.3); ctx.beginPath(); ctx.moveTo(cx - S * 0.12, sy); ctx.lineTo(cx, sy - S * 0.3); ctx.lineTo(cx + S * 0.12, sy); ctx.fill(); },
        barracks: () => { ctx.strokeStyle = '#d7d2c4'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - S * 0.18, cy); ctx.lineTo(cx + S * 0.18, cy + S * 0.22); ctx.moveTo(cx + S * 0.18, cy); ctx.lineTo(cx - S * 0.18, cy + S * 0.22); ctx.stroke(); },
        archery: () => { ctx.fillStyle = '#e8e0c8'; ctx.beginPath(); ctx.arc(sx + S * 0.78, cy + S * 0.12, S * 0.14, 0, 7); ctx.fill(); ctx.fillStyle = '#b33'; ctx.beginPath(); ctx.arc(sx + S * 0.78, cy + S * 0.12, S * 0.07, 0, 7); ctx.fill(); },
        stable: () => { ctx.fillStyle = '#3a2a18'; for (let i = 0; i < 3; i++) ctx.fillRect(sx + S * (0.14 + i * 0.28), cy, S * 0.2, S * 0.26); },
        workshop: () => { ctx.strokeStyle = '#cfcab8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy + S * 0.1, S * 0.14, 0, 7); ctx.stroke(); },
        warehouse: () => { ctx.fillStyle = '#a07a44'; ctx.fillRect(sx + S * 0.12, cy, S * 0.2, S * 0.2); ctx.fillRect(sx + S * 0.38, cy + S * 0.04, S * 0.18, S * 0.16); },
        cottage: () => {},
      }[k];
      if (glyph) glyph();
    }
    ctx.restore();
    if (prog < 1) {
      ctx.fillStyle = `rgba(20,14,8,${0.62 - prog * 0.45})`; ctx.fillRect(sx, sy, S, S);
      ctx.strokeStyle = '#c9a85a'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.strokeRect(sx + 1, sy + 1, S - 2, S - 2); ctx.setLineDash([]);
      this.bar(ctx, sx, sy + S + 3, S, 5, prog, '#e2c15e');
    }
    if (b.flash > 0) { ctx.fillStyle = `rgba(255,120,100,${b.flash * 2})`; ctx.fillRect(sx, sy, S, S); }
    if (b.hp < b.maxHp && prog >= 1) this.bar(ctx, sx, sy - 7, S, 4, b.hp / b.maxHp, this.hpColor(b.hp / b.maxHp));
    if (b.queue.length && b.team === PLAYER) this.bar(ctx, sx, sy + S + 2, S, 3, b.queue[0].t / UNITS[b.queue[0].kind].time, '#7ac1ff');
    if (ui?.isSelected(b)) { ctx.strokeStyle = '#f0e2a0'; ctx.lineWidth = 2; ctx.strokeRect(sx - 3, sy - 3, S + 6, S + 6); }
    if (ui?.isSelected(b) && b.rally) { const [rx, ry] = this.toScreen(b.rally.x, b.rally.y); ctx.strokeStyle = f.accent; ctx.beginPath(); ctx.moveTo(sx + S / 2, sy + S / 2); ctx.lineTo(rx, ry); ctx.stroke(); ctx.fillStyle = f.accent; ctx.fillRect(rx - 1, ry - 12, 2, 12); ctx.fillRect(rx + 1, ry - 12, 8, 5); }
  }

  // ---------------------------------------------------------------- units
  unit(ctx, u, sx, sy, P, ui) {
    const f = HOUSES[u.team], k = u.kind, r = P * (k === 'ram' ? 0.5 : 0.28);
    const bob = Math.sin(u.anim) * (u.path.length ? P * 0.04 : P * 0.01);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.9, r * 1.1, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    const fc = u.face || 1;
    if (k === 'knight' || k === 'scout') {
      ctx.fillStyle = k === 'knight' ? '#5a4632' : '#7b5c3a'; ctx.beginPath(); ctx.ellipse(sx, sy + bob, r * 1.35, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4a3828'; ctx.beginPath(); ctx.ellipse(sx + fc * r * 1.2, sy - r * 0.4 + bob, r * 0.45, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (k === 'ram') {
      ctx.fillStyle = '#5a3a1c'; ctx.fillRect(sx - r, sy - r * 0.4 + bob, r * 2, r * 0.8);
      ctx.fillStyle = f.primary; ctx.fillRect(sx - r * 0.85, sy - r * 0.95 + bob, r * 1.7, r * 0.55);
      ctx.fillStyle = '#9a9a9a'; ctx.fillRect(sx + fc * r - (fc < 0 ? r * 0.3 : 0), sy - r * 0.3 + bob, r * 0.3, r * 0.6);
    } else {
      const body = k === 'spy' ? '#2a2630' : k === 'scholar' ? '#e8e0cc' : f.primary;
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(sx, sy - r * 0.15 + bob, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = f.dark; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = k === 'spy' ? '#1a1820' : '#e0b88a'; ctx.beginPath(); ctx.arc(sx, sy - r * 1.0 + bob, r * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = f.accent; ctx.fillRect(sx - r * 0.45, sy - r * 1.25 + bob, r * 0.9, r * 0.25);
      if (k === 'footman') { ctx.fillStyle = f.dark; ctx.fillRect(sx - fc * r * 1.15 - r * 0.2, sy - r * 0.4 + bob, r * 0.5, r * 0.9); ctx.fillStyle = '#d6d2c6'; ctx.fillRect(sx + fc * r * 0.9 - 1, sy - r * 1.2 + bob, 2.5, r * 1.5); }
      else if (k === 'bowman') { ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx + fc * r * 1.0, sy - r * 0.2 + bob, r * 0.8, -1.2, 1.2, fc < 0); ctx.stroke(); }
      else if (k === 'knight') { ctx.fillStyle = '#d6d2c6'; ctx.fillRect(sx + fc * r * 0.9 - 1, sy - r * 1.8 + bob, 2.5, r * 2); }
      else if (k === 'scholar') { ctx.fillStyle = '#7a3a2a'; ctx.fillRect(sx + fc * r * 0.7, sy - r * 0.3 + bob, r * 0.6, r * 0.5); }
      if (u.carry && u.carry.amount > 0.5) { ctx.fillStyle = { food: '#b0344f', wood: '#8a5a2a', gold: GOLD }[u.carry.kind]; ctx.fillRect(sx - fc * r * 1.2 - r * 0.25, sy - r * 0.2 + bob, r * 0.55, r * 0.55); }
    }
    if (ui?.isSelected(u)) { ctx.strokeStyle = '#f0e2a0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.85, r * 1.5, r * 0.65, 0, 0, Math.PI * 2); ctx.stroke(); }
    if (u.hp < u.maxHp || ui?.isSelected(u)) this.bar(ctx, sx - r * 1.1, sy - r * 2.1, r * 2.2, 3, u.hp / u.maxHp, this.hpColor(u.hp / u.maxHp));
    if (u.flash > 0) { ctx.fillStyle = 'rgba(255,90,70,.5)'; ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fill(); }
  }

  bar(ctx, x, y, w, h, r, color) {
    ctx.fillStyle = '#1b130b'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, r)), h);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  hpColor(r) { return r > 0.5 ? '#6dbf6a' : r > 0.25 ? '#d4b44a' : '#cc4444'; }

  ghost(ctx, g, ui, P) {
    const s = BUILDINGS[ui.placing].size, tx = ui.hoverTX, ty = ui.hoverTY;
    const chk = g.canPlace(PLAYER, ui.placing, tx, ty);
    const [sx, sy] = this.toScreen(tx, ty);
    ctx.fillStyle = chk.ok ? 'rgba(110,200,110,0.38)' : 'rgba(210,70,70,0.4)';
    ctx.fillRect(sx, sy, s * P, s * P);
    ctx.strokeStyle = chk.ok ? '#8fe08f' : '#e07070'; ctx.lineWidth = 2; ctx.strokeRect(sx, sy, s * P, s * P);
    ctx.font = 'bold 13px Georgia, serif'; ctx.textAlign = 'left';
    const label = chk.ok ? BUILDINGS[ui.placing].label : `${BUILDINGS[ui.placing].label}: ${chk.reason}`;
    ctx.fillStyle = '#000'; ctx.fillText(label, sx + 1, sy - 5); ctx.fillStyle = chk.ok ? '#d9f5d0' : '#ffc4c0'; ctx.fillText(label, sx, sy - 6);
  }
}

// ---------------------------------------------------------------- crests
export function drawCrest(ctx, cx, cy, s, idx) {
  const h = HOUSES[idx];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, -s * 0.55); ctx.lineTo(s * 0.5, -s * 0.55); ctx.lineTo(s * 0.5, s * 0.1);
  ctx.quadraticCurveTo(s * 0.5, s * 0.5, 0, s * 0.62); ctx.quadraticCurveTo(-s * 0.5, s * 0.5, -s * 0.5, s * 0.1); ctx.closePath();
  ctx.fillStyle = h.primary; ctx.fill();
  ctx.lineWidth = Math.max(1.5, s * 0.07); ctx.strokeStyle = '#e2c15e'; ctx.stroke();
  ctx.fillStyle = h.accent; ctx.strokeStyle = h.accent; ctx.lineWidth = Math.max(1.5, s * 0.06);
  switch (idx) {
    case 0: ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.17, 0, 7); ctx.fill(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * s * 0.22, -s * 0.05 + Math.sin(a) * s * 0.22); ctx.lineTo(Math.cos(a) * s * 0.34, -s * 0.05 + Math.sin(a) * s * 0.34); ctx.stroke(); } break;
    case 1: ctx.beginPath(); ctx.moveTo(0, -s * 0.42); ctx.lineTo(0, s * 0.4); ctx.moveTo(-s * 0.2, -s * 0.1); ctx.lineTo(s * 0.2, -s * 0.1); ctx.stroke(); break;
    case 2: for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.2 + i * s * 0.2); ctx.quadraticCurveTo(-s * 0.15, -s * 0.34 + i * s * 0.2, 0, -s * 0.2 + i * s * 0.2); ctx.quadraticCurveTo(s * 0.15, -s * 0.06 + i * s * 0.2, s * 0.3, -s * 0.2 + i * s * 0.2); ctx.stroke(); } break;
    case 3: ctx.beginPath(); ctx.moveTo(0, -s * 0.42); ctx.lineTo(s * 0.26, s * 0.0); ctx.lineTo(-s * 0.26, s * 0.0); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(0, -s * 0.2); ctx.lineTo(s * 0.3, s * 0.25); ctx.lineTo(-s * 0.3, s * 0.25); ctx.closePath(); ctx.fill(); break;
    default: ctx.beginPath(); ctx.moveTo(0, -s * 0.42); ctx.quadraticCurveTo(s * 0.34, -s * 0.05, s * 0.12, s * 0.28); ctx.quadraticCurveTo(0, s * 0.1, -s * 0.12, s * 0.28); ctx.quadraticCurveTo(-s * 0.34, -s * 0.05, 0, -s * 0.42); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- minimap
export class Minimap {
  constructor(canvas, game, renderer) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.game = game; this.r = renderer;
    this.buf = document.createElement('canvas');
    this.t = 0;
  }
  setGame(g) { this.game = g; this.t = 0; }
  refresh() {
    const g = this.game, W = g.W, H = g.H;
    if (this.buf.width !== W) { this.buf.width = W; this.buf.height = H; }
    const bc = this.buf.getContext('2d'), img = bc.createImageData(W, H), d = img.data;
    const seen = g.seen[PLAYER], vis = g.vis[PLAYER];
    for (let i = 0; i < W * H; i++) {
      const o = i * 4;
      let c;
      if (g.fogOn && !seen[i]) c = [8, 10, 14];
      else {
        const t = g.terrain[i];
        c = t === T_WATER ? [38, 92, 118] : t === T_FORD ? [140, 100, 56] : t === T_DIRT ? [128, 98, 54] : [74, 118, 58];
        if (g.fogOn && !vis[i]) c = [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55];
      }
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
    for (const n of g.resources) if (n.amount > 0 && n.kind === 'gold' && (!g.fogOn || seen[n.y * W + n.x])) { const o = (n.y * W + n.x) * 4; d[o] = 240; d[o + 1] = 200; d[o + 2] = 70; }
    bc.putImageData(img, 0, 0);
  }
  draw(dt) {
    this.t -= dt;
    if (this.t <= 0) { this.refresh(); this.t = 0.3; }
    const g = this.game, ctx = this.ctx, cw = this.canvas.width, ch = this.canvas.height;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buf, 0, 0, cw, ch);
    const sx = cw / g.W, sy = ch / g.H;
    const vis = g.vis[PLAYER], seen = g.seen[PLAYER];
    for (const v of g.villages) {
      if (g.fogOn && !seen[Math.floor(v.y) * g.W + Math.floor(v.x)]) continue;
      ctx.fillStyle = v.owner >= 0 ? HOUSES[v.owner].accent : '#cdbb8a'; ctx.fillRect(v.tx * sx, v.ty * sy, Math.max(4, v.size * sx), Math.max(4, v.size * sy));
      ctx.strokeStyle = '#000'; ctx.strokeRect(v.tx * sx + 0.5, v.ty * sy + 0.5, Math.max(4, v.size * sx), Math.max(4, v.size * sy));
    }
    for (const b of g.buildings) {
      if (b.team !== PLAYER && g.fogOn && !seen[Math.floor(b.y) * g.W + Math.floor(b.x)]) continue;
      ctx.fillStyle = HOUSES[b.team].accent; ctx.fillRect(b.tx * sx, b.ty * sy, Math.max(3, b.size * sx), Math.max(3, b.size * sy));
    }
    for (const u of g.units) {
      if (u.team !== PLAYER && (!g.fogOn || !vis[Math.floor(u.y) * g.W + Math.floor(u.x)])) continue;
      ctx.fillStyle = HOUSES[u.team].primary; ctx.fillRect(u.x * sx - 1, u.y * sy - 1, 3, 3);
    }
    const r = this.r, vw = r.w / r.P, vh = r.h / r.P;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(r.cam.x * sx, r.cam.y * sy, vw * sx, vh * sy);
  }
}

// ---------------------------------------------------------------- vale preview (menu) and campaign map
export function drawVale(canvas, game, { fog = false, cam = null, view = null, labels = false } = {}) {
  const ctx = canvas.getContext('2d'), W = game.W, H = game.H, cw = canvas.width, ch = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const sx = cw / W, sy = ch / H;
  const seen = game.seen[PLAYER], vis = game.vis[PLAYER];
  ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, cw, ch);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (fog && game.fogOn && !seen[i]) continue;
    const t = game.terrain[i];
    let c = t === T_WATER ? [38, 92, 118] : t === T_FORD ? [140, 100, 56] : t === T_DIRT ? [128, 98, 54] : [[77, 123, 59], [82, 127, 62], [74, 118, 55], [87, 132, 64]][(hash(x, y) * 4) | 0];
    if (fog && game.fogOn && !vis[i]) c = c.map((q) => q * 0.55);
    ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
    ctx.fillRect(x * sx, y * sy, sx + 0.6, sy + 0.6);
  }
  for (const n of game.resources) {
    if (n.amount <= 0 || (fog && game.fogOn && !seen[n.y * W + n.x])) continue;
    ctx.fillStyle = n.kind === 'gold' ? '#f0c84a' : n.kind === 'tree' ? '#1f4a24' : '#b0344f';
    const r = n.kind === 'gold' ? Math.max(2.2, sx * 0.7) : Math.max(1.2, sx * 0.45);
    ctx.beginPath(); ctx.arc((n.x + 0.5) * sx, (n.y + 0.5) * sy, r, 0, 7); ctx.fill();
  }
  for (const v of game.villages) {
    if (fog && game.fogOn && !seen[Math.floor(v.y) * W + Math.floor(v.x)]) continue;
    const cx = (v.x) * sx, cy = (v.y) * sy, s = Math.max(9, sx * 3);
    ctx.fillStyle = v.owner >= 0 ? HOUSES[v.owner].primary : '#b9a672'; ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
    ctx.strokeStyle = '#f0e2b6'; ctx.lineWidth = 1.5; ctx.strokeRect(cx - s / 2, cy - s / 2, s, s);
    if (labels) { ctx.font = '11px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#000'; ctx.fillText(v.name, cx + 1, cy + s + 11); ctx.fillStyle = '#f0e2b6'; ctx.fillText(v.name, cx, cy + s + 10); }
  }
  for (const b of game.buildings) {
    if (b.kind !== 'hall' && b.kind !== 'keep') continue;
    if (fog && game.fogOn && b.team !== PLAYER && !seen[Math.floor(b.y) * W + Math.floor(b.x)]) continue;
    drawDisc(ctx, b.x * sx, b.y * sy, Math.max(9, sx * 3), b.team);
  }
  if (!fog) game.map.starts.slice(0, game.houses).forEach(([x, y], i) => drawDisc(ctx, (x + 1.5) * sx, (y + 1.5) * sy, Math.max(9, sx * 3), i));
  if (cam) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(cam.x * sx, cam.y * sy, view.w * sx, view.h * sy);
  }
}
function drawDisc(ctx, cx, cy, r, team) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = HOUSES[team].accent; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.66, 0, 7); ctx.fillStyle = HOUSES[team].primary; ctx.fill();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
}
