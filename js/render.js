// Seven Holds - isometric canvas drawing. Reads game state, never changes it.
// World tile (x, y) projects to the screen as ((x - y) * HW, (x + y) * HH): a 2:1 diamond tile like the concept boards.
import {
  PLAYER, HOUSES, T_WATER, T_FORD, T_DIRT, UNITS, BUILDINGS, INFLUENCE, STORES, HAUL, T_GRASS, T_DRY, MATS, GOOD_COLOR,
} from './config.js';
import { TerrainCache, FogLayer } from './terrain.js';
import { tinted, ramSprite, camelSprite, oreSprite, mineSprite, IMG } from './art.js';

export const HW = 24, HH = 12; // half tile width / height in px at zoom 1
const hash = (x, y) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
const GOLD = '#e2c15e';
const GROUND_RGB = [[74, 118, 58], [128, 98, 54], [38, 92, 118], [140, 100, 56], [146, 132, 68], [194, 172, 112], [98, 94, 90], [224, 230, 236]];

// image per building kind and how wide it draws, in footprints (1 = same width as its diamond)
const BSPR = { hall: ['hall', 1.0], keep: ['keep_blue', 1.02], cottage: ['cottage', 1.2], farm: ['farm', 1.0], mill: ['mill', 1.2], warehouse: ['warehouse', 1.0], market: ['market', 1.0], forge: ['forge', 1.0], workshop: ['workshop', 1.0], tavern: ['tavern', 1.2], academy: ['academy', 1.0], temple: ['temple', 1.25], barracks: ['barracks', 1.0], archery: ['archery', 1.0], stable: ['stable', 1.0], tower: ['tower', 1.15], foundry: ['forge', 1.14], mine: ['rock', 1.35] };
const SMOKE = { cottage: [[0.6, 0.03]], forge: [[0.23, 0.04]], foundry: [[0.23, 0.04], [0.62, 0.12]] };
const USCALE = { recruit: 50, serf: 44, scout: 50, footman: 56, bowman: 56, knight: 72, spy: 52, scholar: 54 }; // drawn height at zoom 1
// villages are small compositions of the same art: [sprite, world dx, world dy, width in tiles]
const VCOMP = {
  hamlet: [['village_cluster', 0, 0.35, 3.9]],
  market: [['market', -0.1, 0.0, 3.0], ['cottage_thatch', 1.0, 1.0, 1.7]],
  mine: [['gold', 0.2, 0.0, 2.6], ['cottage_thatch', -0.7, 1.0, 1.7], ['warehouse', 1.0, -0.4, 1.7]],
  hillfort: [['keep', 0, 0.55, 3.4]],
  abbey: [['temple', 0.3, 0.1, 2.5], ['cottage_thatch', -0.9, 1.0, 1.6]],
  inn: [['tavern', 0.2, 0.1, 2.5], ['cottage_thatch', -0.9, 1.0, 1.6]],
};

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.terrain = new TerrainCache(game);
    this.fog = new FogLayer(game);
    this.cam = { x: 0, y: 0, zoom: 1 }; // x, y = the world tile at the middle of the screen
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = 0; this.h = 0;
    this.props = null; this.propsFor = null;
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
  get z() { return this.cam.zoom; }
  toScreen(x, y) { const z = this.cam.zoom, a = x - this.cam.x, b = y - this.cam.y; return [this.w / 2 + (a - b) * HW * z, this.h / 2 + (a + b) * HH * z]; }
  toWorld(sx, sy) { const z = this.cam.zoom, a = (sx - this.w / 2) / (HW * z), b = (sy - this.h / 2) / (HH * z); return [this.cam.x + (a + b) / 2, this.cam.y + (b - a) / 2]; }
  isoMatrix(tx0, ty0, ppt) { const z = this.cam.zoom, [ex, ey] = this.toScreen(tx0, ty0); return [HW * z / ppt, HH * z / ppt, -HW * z / ppt, HH * z / ppt, ex, ey]; }
  viewPoly() { return [this.toWorld(0, 0), this.toWorld(this.w, 0), this.toWorld(this.w, this.h), this.toWorld(0, this.h)]; }
  viewBounds(margin = 0) {
    const p = this.viewPoly(), g = this.game;
    return [Math.max(0, Math.floor(Math.min(...p.map((q) => q[0])) - margin)), Math.max(0, Math.floor(Math.min(...p.map((q) => q[1])) - margin)),
      Math.min(g.W, Math.ceil(Math.max(...p.map((q) => q[0])) + margin)), Math.min(g.H, Math.ceil(Math.max(...p.map((q) => q[1])) + margin))];
  }
  onScreen(x, y, pad = 0) { const [sx, sy] = this.toScreen(x, y); return sx > -pad && sy > -pad && sx < this.w + pad && sy < this.h + pad; }
  clampCam() { const g = this.game; this.cam.x = Math.max(0, Math.min(g.W, this.cam.x)); this.cam.y = Math.max(0, Math.min(g.H, this.cam.y)); }
  centerOn(x, y) { this.cam.x = x; this.cam.y = y; this.clampCam(); }
  panScreen(dx, dy) { const z = this.cam.zoom, a = dx / (HW * z), b = dy / (HH * z); this.cam.x += (a + b) / 2; this.cam.y += (b - a) / 2; this.clampCam(); }
  zoomAt(f, sx, sy) {
    const [wx, wy] = this.toWorld(sx, sy);
    this.cam.zoom = Math.max(0.6, Math.min(1.8, this.cam.zoom * f));
    const [wx2, wy2] = this.toWorld(sx, sy);
    this.cam.x += wx - wx2; this.cam.y += wy - wy2; this.clampCam();
  }

  // decorative bushes and rocks scattered on open meadow, fixed per map
  makeProps() {
    const g = this.game, out = [];
    for (let y = 1; y < g.H - 1; y++) for (let x = 1; x < g.W - 1; x++) {
      const tt = g.terrain[y * g.W + x]; if ((tt !== T_GRASS && tt !== T_DRY) || g.block[y * g.W + x]) continue;
      const h = hash(x * 7 + 3, y * 13 + 5);
      if (h < 0.011) out.push({ x: x + hash(x, y + 9), y: y + hash(x + 9, y), k: h < 0.0055 ? 'bush_s' : h < 0.0085 ? 'bush_m' : 'rock', f: hash(y, x) > 0.5 });
    }
    this.props = out; this.propsFor = g.terrain;
  }

  draw(ui) {
    const { ctx, game: g } = this;
    const z = this.cam.zoom, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#06080b';
    ctx.fillRect(0, 0, this.w, this.h);
    const t = performance.now() / 1000;
    this.hits = [];
    if (this.propsFor !== g.terrain) this.makeProps();
    const [x0, y0, x1, y1] = this.viewBounds(5);
    const seen = g.seen[PLAYER], vis = g.vis[PLAYER];
    const isSeen = (x, y) => !g.fogOn || seen[Math.floor(y) * g.W + Math.floor(x)] === 1;
    const isVis = (x, y) => !g.fogOn || vis[Math.floor(y) * g.W + Math.floor(x)] === 1;

    this.terrain.draw(ctx, this);
    this.shimmer(ctx, g, x0, y0, x1, y1, t, isSeen, z);
    if (ui?.placing) this.territory(ctx, g);

    // everything that stands on the ground, back to front
    const items = [];
    for (const p of this.props) if (p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1 && isSeen(p.x, p.y)) items.push({ o: p, k: 4, z: p.x + p.y });
    for (const n of g.resources) {
      if (n.amount <= 0 || n.covered || n.x < x0 || n.x > x1 || n.y < y0 || n.y > y1 || !isSeen(n.x, n.y)) continue;
      items.push({ o: n, k: 0, z: n.x + n.y + 1 });
    }
    for (const v of g.villages) if (isSeen(v.x, v.y) && v.tx + v.size >= x0 && v.tx <= x1 && v.ty + v.size >= y0 && v.ty <= y1) items.push({ o: v, k: 1, z: v.tx + v.ty + v.size * 2 - 1 });
    for (const b of g.buildings) if ((b.team === PLAYER || isSeen(b.x, b.y)) && b.tx + b.size >= x0 && b.tx <= x1 && b.ty + b.size >= y0 && b.ty <= y1) items.push({ o: b, k: 2, z: b.tx + b.ty + b.size * 2 - 1 });
    for (const u of g.units) {
      if (u.hp <= 0 || u.hidden || u.inside || !(u.team === PLAYER || isVis(u.x, u.y))) continue;
      if (u.x < x0 || u.x > x1 || u.y < y0 || u.y > y1) continue;
      items.push({ o: u, k: 3, z: u.x + u.y + 0.2 });
    }
    items.sort((a, b) => a.z - b.z);
    for (const it of items) {
      const e = it.o;
      if (it.k === 0) this.node(ctx, e, isVis(e.x, e.y), z);
      else if (it.k === 1) this.village(ctx, e, !(e.owner === PLAYER) && !isVis(e.x, e.y), ui, t, z);
      else if (it.k === 2) this.building(ctx, e, e.team !== PLAYER && !isVis(e.x, e.y), ui, t, z);
      else if (it.k === 3) this.unit(ctx, e, ui, t, z);
      else this.prop(ctx, e, z);
    }
    for (const u of g.units) u.hidden = false; // re-set each tick by infiltrators

    // projectiles
    ctx.strokeStyle = '#f3e2a0'; ctx.lineWidth = 2;
    for (const p of g.projectiles) {
      if (!isVis(p.x, p.y)) continue;
      const [sx, sy] = this.toScreen(p.x, p.y), a = p.ang || 0;
      const dx = (Math.cos(a) - Math.sin(a)) * HW, dy = (Math.cos(a) + Math.sin(a)) * HH, l = Math.hypot(dx, dy) || 1;
      ctx.beginPath(); ctx.moveTo(sx - (dx / l) * 9 * z, sy - 14 * z - (dy / l) * 9 * z); ctx.lineTo(sx, sy - 14 * z); ctx.stroke();
    }
    // floaters
    ctx.font = `bold ${Math.round(13 * Math.max(0.8, z))}px Georgia, serif`;
    ctx.textAlign = 'center';
    const fcol = { food: '#e58aa3', wood: '#d1a066', gold: GOLD };
    for (const f of g.floaters) {
      const [sx, sy0] = this.toScreen(f.x, f.y), sy = sy0 - 20 * z - f.age * 24 * z;
      ctx.globalAlpha = Math.max(0, 1 - f.age / 1.3);
      ctx.fillStyle = '#000'; ctx.fillText(f.text, sx + 1, sy + 1);
      ctx.fillStyle = fcol[f.res] || '#fff'; ctx.fillText(f.text, sx, sy);
    }
    ctx.globalAlpha = 1;

    this.fog.update();
    this.fog.draw(ctx, this);

    if (ui?.placing) this.ghost(ctx, g, ui);
    if (ui?.dragBox) {
      const b = ui.dragBox;
      ctx.fillStyle = 'rgba(240,226,160,0.12)'; ctx.strokeStyle = '#f0e2a0'; ctx.lineWidth = 1;
      ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); ctx.strokeRect(b.x0 + 0.5, b.y0 + 0.5, b.x1 - b.x0, b.y1 - b.y0);
    }
    if (ui?.pings) for (const p of ui.pings) {
      const [sx, sy] = this.toScreen(p.x, p.y);
      ctx.strokeStyle = p.color; ctx.globalAlpha = Math.max(0, 1 - p.age / 0.8); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(sx, sy, HW * z * (0.4 + p.age * 1.2), HH * z * (0.4 + p.age * 1.2), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // what is under the cursor: topmost drawn thing whose sprite box holds the point
  hit(o, type, x0, y0, x1, y1) { this.hits.push({ o, type, x0, y0, x1, y1 }); }
  pick(sx, sy, types = null) {
    for (let i = this.hits.length - 1; i >= 0; i--) { const h = this.hits[i]; if ((!types || types.includes(h.type)) && sx >= h.x0 && sx <= h.x1 && sy >= h.y0 && sy <= h.y1) return h; }
    return null;
  }

  // ---------------------------------------------------------------- terrain extras
  shimmer(ctx, g, x0, y0, x1, y1, t, isSeen, z) {
    ctx.lineWidth = Math.max(1, z);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (g.terrain[y * g.W + x] !== T_WATER || !isSeen(x, y)) continue;
      const h = hash(x, y), ph = t * (0.9 + h * 0.5) + h * 40, a = 0.08 + 0.2 * Math.max(0, Math.sin(ph));
      if (a < 0.14) continue;
      const [sx, sy] = this.toScreen(x + 0.3 + h * 0.4, y + 0.3 + hash(y, x) * 0.4), ox = Math.sin(ph * 0.7) * 3 * z;
      ctx.strokeStyle = `rgba(215,236,244,${a})`;
      ctx.beginPath(); ctx.moveTo(sx - 7 * z + ox, sy); ctx.lineTo(sx + 7 * z + ox, sy); ctx.stroke();
    }
  }
  diamond(ctx, tx, ty, w, h) {
    const a = this.toScreen(tx, ty), b = this.toScreen(tx + w, ty), c = this.toScreen(tx + w, ty + h), d = this.toScreen(tx, ty + h);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
  }
  // while placing: where your castles, temples and taverns sway villages (no limit on where you may build), and your stores (haul)
  territory(ctx, g) {
    ctx.save();
    const z = this.cam.zoom;
    ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
    for (const b of g.buildings) {
      if (b.team !== PLAYER || b.built < 1 || b.hp <= 0 || !INFLUENCE[b.kind]) continue;
      const inf = INFLUENCE[b.kind], [sx, sy] = this.toScreen(b.x, b.y), R = inf.r * Math.SQRT2;
      const weak = inf.guard && g.guardOf(b) < 1;
      ctx.strokeStyle = weak ? 'rgba(220,170,120,0.35)' : 'rgba(244,220,122,0.55)'; ctx.fillStyle = weak ? 'rgba(220,170,120,0.03)' : 'rgba(244,220,122,0.05)';
      ctx.beginPath(); ctx.ellipse(sx, sy, R * HW * z, R * HH * z, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- scenery
  sprite(ctx, c, sx, sy, w, flip = false, alpha = 1) {
    if (!c) return null;
    const h = (c.height / c.width) * w;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(c, sx - w / 2, sy - h, w, h);
    if (alpha !== 1) ctx.globalAlpha = 1;
    return h;
  }
  shadowAt(ctx, sx, sy, rx, ry, a = 0.3) { ctx.fillStyle = `rgba(10,12,4,${a})`; ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, 7); ctx.fill(); }
  prop(ctx, p, z) {
    const [sx, sy] = this.toScreen(p.x, p.y);
    const w = (p.k === 'rock' ? 36 : p.k === 'bush_s' ? 34 : 28) * z;
    this.sprite(ctx, tinted(p.k, 0, null, p.f), sx, sy + 3 * z, w);
  }
  node(ctx, n, vis, z) {
    const h = hash(n.x, n.y), [sx, sy] = this.toScreen(n.x + 0.5, n.y + 0.55), a = vis ? 1 : 0.65;
    if (n.kind === 'tree') {
      const v = (h * 6) | 0, sp = n.v === 'pine' ? 'pine' : n.v === 'palm' ? 'palm' : 'oak';
      const c = tinted(sp, 0, null, v & 1, sp === 'oak' ? [0.98, 1.1, 1.22][v % 3] : [0.95, 1, 1.08][v % 3]);
      const w = (sp === 'oak' ? 50 + h * 22 : sp === 'pine' ? 40 + h * 16 : 44 + h * 14) * z;
      this.shadowAt(ctx, sx + 6 * z, sy - 1 * z, w * 0.34, 6 * z, 0.28 * a);
      this.sprite(ctx, c, sx, sy + 2 * z, w, false, a);
      this.hit(n, 'node', sx - w * 0.22, sy - w * 0.9, sx + w * 0.22, sy + 2 * z);
    } else if (n.kind === 'gold') {
      this.shadowAt(ctx, sx, sy, 22 * z, 6 * z, 0.3 * a);
      this.sprite(ctx, tinted('gold', 0, null, h > 0.5), sx, sy + 4 * z, 50 * z, false, a);
      this.hit(n, 'node', sx - 22 * z, sy - 24 * z, sx + 22 * z, sy + 4 * z);
    } else if (MATS.includes(n.kind)) {
      const c = oreSprite(n.kind, h > 0.5), w = (n.kind === 'stone' ? 46 : 54) * z;
      this.shadowAt(ctx, sx, sy, 22 * z, 6 * z, 0.3 * a);
      this.sprite(ctx, c, sx, sy + 4 * z, w, false, a);
      this.hit(n, 'node', sx - 22 * z, sy - 22 * z, sx + 22 * z, sy + 4 * z);
    } else {
      this.shadowAt(ctx, sx, sy, 20 * z, 5 * z, 0.3 * a);
      this.sprite(ctx, tinted('berry', 0, null, h > 0.5), sx, sy + 4 * z, 46 * z, false, a);
      this.hit(n, 'node', sx - 20 * z, sy - 30 * z, sx + 20 * z, sy + 4 * z);
    }
  }
  badge(ctx, x, y, n, f, z) {
    const r = 9 * z + 2;
    ctx.fillStyle = f.dark; ctx.strokeStyle = f.accent; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(10 * z + 3)}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n, x, y + 1); ctx.textBaseline = 'alphabetic';
  }
  pennant(ctx, px, py, z, t, prim, acc, phase = 0) {
    const w = 15 * z, h = 9 * z, n = 5;
    ctx.fillStyle = prim; ctx.beginPath(); ctx.moveTo(px, py);
    for (let i = 1; i <= n; i++) ctx.lineTo(px + (w * i) / n, py + Math.sin(t * 4 + phase + i) * h * 0.12 * (i / n));
    for (let i = n; i >= 0; i--) ctx.lineTo(px + (w * i) / n, py + h + Math.sin(t * 4 + phase + i) * h * 0.12 * (i / n));
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = acc; ctx.lineWidth = 1; ctx.stroke();
  }
  smoke(ctx, x, y, z, t, seed) {
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.3 + i / 4 + seed * 0.37) % 1;
      ctx.fillStyle = `rgba(205,203,196,${0.32 * (1 - ph)})`;
      ctx.beginPath(); ctx.arc(x + Math.sin(ph * 5 + seed) * 3 * z + ph * 6 * z, y - ph * 30 * z, (2 + ph * 5) * z, 0, 7); ctx.fill();
    }
  }

  // ---------------------------------------------------------------- villages
  village(ctx, v, dim, ui, t, z) {
    const f = v.owner >= 0 ? HOUSES[v.owner] : null, team = v.owner;
    const cx = v.tx + v.size / 2, cy = v.ty + v.size / 2;
    // footing: a tinted diamond and trodden earth
    this.diamond(ctx, v.tx, v.ty, v.size, v.size);
    ctx.fillStyle = f ? f.primary : '#8a7a50'; ctx.globalAlpha = f ? 0.2 : 0.12; ctx.fill(); ctx.globalAlpha = 1;
    if (f) { ctx.strokeStyle = f.accent; ctx.lineWidth = 2; ctx.globalAlpha = 0.75; ctx.stroke(); ctx.globalAlpha = 1; }
    const comp = VCOMP[v.kind] || VCOMP.hamlet;
    const parts = comp.map(([name, dx, dy, w]) => ({ name, dx, dy, w })).sort((a, b) => a.dx + a.dy - (b.dx + b.dy));
    let top = 1e9, midx = 0, left = 1e9, right = -1e9, bottom = -1e9;
    if (dim) ctx.globalAlpha = 0.78;
    for (const p of parts) {
      const [sx, sy] = this.toScreen(cx + p.dx + 0.7, cy + p.dy + 0.7);
      const c = tinted(p.name, team, 'banner', false);
      if (p.name === 'gold') this.shadowAt(ctx, sx, sy, p.w * HW * z * 0.5, 7 * z, 0.3);
      const h = this.sprite(ctx, c, sx, sy, p.w * 2 * HW * z, false, 1);
      if (h != null) { const ww = p.w * 2 * HW * z; top = Math.min(top, sy - h); left = Math.min(left, sx - ww / 2); right = Math.max(right, sx + ww / 2); bottom = Math.max(bottom, sy); }
    }
    if (v.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.6, v.flash); this.diamond(ctx, v.tx, v.ty, v.size, v.size); ctx.fillStyle = '#fff'; ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
    ctx.globalAlpha = 1;
    this.hit(v, 'village', left, top, right, bottom);
    const m = this.toScreen(cx, cy), W = v.size * HW * z * 1.4;
    this.bar(ctx, m[0] - W / 2, top - 14, W, 4, v.protection / v.maxProtection, '#c0473b');
    this.bar(ctx, m[0] - W / 2, top - 9, W, 4, v.loyalty / 100, '#5a9ad8');
    if (v.garrison?.length && v.owner === PLAYER) this.badge(ctx, m[0] + W / 2 + 12, top - 6, v.garrison.length, HOUSES[PLAYER], z);
    if (ui?.isSelected(v)) { ctx.strokeStyle = '#f0e2a0'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 4]); this.diamond(ctx, v.tx - 0.2, v.ty - 0.2, v.size + 0.4, v.size + 0.4); ctx.stroke(); ctx.setLineDash([]); }
    if (z > 0.7) { ctx.font = `${Math.round(11 * z + 2)}px Georgia, serif`; ctx.textAlign = 'center'; const [lx, ly] = this.toScreen(v.tx + v.size, v.ty + v.size); ctx.fillStyle = '#000'; ctx.fillText(v.name, lx + 1, ly + 15); ctx.fillStyle = '#f0e2b6'; ctx.fillText(v.name, lx, ly + 14); }
  }

  // ---------------------------------------------------------------- buildings
  building(ctx, b, dim, ui, t, z) {
    const f = HOUSES[b.team], prog = b.built, [name, mul] = BSPR[b.kind] || ['cottage', 1];
    const c = b.kind === 'mine' ? mineSprite(b.ore || 'stone', b.team) : tinted(name, b.team, 'banner');
    const [bx, by] = this.toScreen(b.tx + b.size, b.ty + b.size);            // bottom corner of the footprint
    const w = b.size * 2 * HW * z * mul, h = c ? (c.height / c.width) * w : 0;
    const dy = by - h + b.size * HH * z * 0.34;
    // house-colour footing
    this.diamond(ctx, b.tx, b.ty, b.size, b.size); ctx.fillStyle = f.primary; ctx.globalAlpha = 0.24; ctx.fill(); ctx.globalAlpha = 1;
    this.shadowAt(ctx, bx + 4 * z, by - b.size * HH * z * 0.5, w * 0.42, b.size * HH * z * 0.5, 0.22);
    ctx.save();
    if (dim) ctx.globalAlpha = 0.8;
    if (c) {
      if (prog < 1) {
        const r = 0.2 + 0.8 * prog;
        ctx.beginPath(); ctx.rect(bx - w / 2 - 2, dy + h * (1 - r), w + 4, h * r + 2); ctx.clip();
        ctx.globalAlpha *= 0.94;
      }
      ctx.drawImage(c, bx - w / 2, dy, w, h);
    }
    ctx.restore();
    this.hit(b, 'building', bx - w * 0.45, dy + h * 0.1, bx + w * 0.45, by);
    if (prog < 1) {
      const top = dy + h * (1 - (0.2 + 0.8 * prog)) + 2, bot = by - 2 * z;
      ctx.strokeStyle = '#7a5c30'; ctx.lineWidth = Math.max(2, 3 * z);
      for (const k of [-0.34, 0, 0.34]) { ctx.beginPath(); ctx.moveTo(bx + k * w, bot - Math.abs(k) * w * 0.28); ctx.lineTo(bx + k * w, top - Math.abs(k) * 4); ctx.stroke(); }
      ctx.lineWidth = Math.max(1.5, 2 * z);
      for (let y = bot - 12 * z; y > top; y -= 18 * z) { ctx.beginPath(); ctx.moveTo(bx - 0.34 * w, y); ctx.lineTo(bx + 0.34 * w, y); ctx.stroke(); }
      this.bar(ctx, bx - w * 0.3, by + 6 * z, w * 0.6, 5, prog, '#e2c15e');
    } else if (!dim) {
      const sm = SMOKE[b.kind];
      if (sm) sm.forEach(([fx, fy], i) => this.smoke(ctx, bx - w / 2 + fx * w, dy + fy * h, z, t, b.id + i));
      if (b.kind === 'mine' && this.game.minersOf(b) > 0) for (let i = 0; i < 3; i++) { const ph = (t * 1.3 + i / 3 + b.id * 0.17) % 1; ctx.fillStyle = `rgba(190,175,140,${0.35 * (1 - ph)})`; ctx.beginPath(); ctx.arc(bx + (ph - 0.4) * 22 * z, by - 26 * z - ph * 18 * z, (2 + ph * 5) * z, 0, 7); ctx.fill(); }
      if (b.kind === 'foundry' && b.working) { const gx = bx - w * 0.3, gy = dy + h * 0.72, gr = 30 * z, a = 0.5 + Math.sin(t * 8 + b.id) * 0.12; const g2 = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr); g2.addColorStop(0, `rgba(255,160,50,${a})`); g2.addColorStop(1, 'rgba(255,100,30,0)'); ctx.fillStyle = g2; ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2); }
      if (b.kind === 'forge') { const gx = bx - w * 0.3, gy = dy + h * 0.72, gr = 26 * z, a = 0.42 + Math.sin(t * 9 + b.id) * 0.1 + Math.sin(t * 23) * 0.05; const g2 = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr); g2.addColorStop(0, `rgba(255,170,60,${a})`); g2.addColorStop(1, 'rgba(255,110,30,0)'); ctx.fillStyle = g2; ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2); }
    }
    if (b.flash > 0 && c) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.7, b.flash * 2); ctx.drawImage(c, bx - w / 2, dy, w, h); ctx.restore(); }
    if (b.garrison?.length && b.team === PLAYER) this.badge(ctx, bx + w * 0.34, dy + h * 0.12, b.garrison.length, f, z);
    if (b.hp < b.maxHp && prog >= 1) this.bar(ctx, bx - w * 0.3, dy - 6, w * 0.6, 4, b.hp / b.maxHp, this.hpColor(b.hp / b.maxHp));
    if (b.queue.length && b.team === PLAYER) this.bar(ctx, bx - w * 0.3, by + 4 * z, w * 0.6, 3, b.queue[0].t / UNITS[b.queue[0].kind].time, '#7ac1ff');
    if (ui?.isSelected(b)) { ctx.strokeStyle = '#f0e2a0'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 4]); this.diamond(ctx, b.tx - 0.1, b.ty - 0.1, b.size + 0.2, b.size + 0.2); ctx.stroke(); ctx.setLineDash([]); }
    if (ui?.isSelected(b) && b.rally) { const [sx, sy] = this.toScreen(b.x, b.y), [rx, ry] = this.toScreen(b.rally.x, b.rally.y); ctx.strokeStyle = f.accent; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(rx, ry); ctx.stroke(); ctx.fillStyle = f.accent; ctx.fillRect(rx - 1, ry - 14, 2, 14); ctx.fillRect(rx + 1, ry - 14, 9, 5); }
  }

  // ---------------------------------------------------------------- units
  unit(ctx, u, ui, t, z) {
    const st = UNITS[u.kind], [sx, sy] = this.toScreen(u.x, u.y);
    // turning: the art looks left. Face the way it travels on screen (or toward its work); horizontal turns squash through the
    // middle, moving up the screen shows its back (darker), moving toward the camera shows it full-on.
    const moving = u.path.length > 0;
    const tt = t, dtF = Math.min(0.1, Math.max(0, tt - (u._lt ?? tt))); u._lt = tt;
    let vx = 0, vy = 0;
    // direction comes from world motion (the camera may be panning), projected to the screen: right = +x -y, down = +x +y
    if (u._lx != null && moving && Math.hypot(u.x - u._lx, u.y - u._ly) > 0.004) { const wx = u.x - u._lx, wy = u.y - u._ly; vx = (wx - wy) * HW; vy = (wx + wy) * HH; }
    else if (!moving) {
      const k = u.task, tg = k.type === 'gather' ? this.game.resources[k.nodeId] : (k.type === 'mine' || k.type === 'build' || k.type === 'attack' || k.type === 'infiltrate') ? this.game.byId.get(k.buildingId ?? k.targetId) : null;
      if (tg) { const [tx, ty] = this.toScreen(tg.x + (tg.size ? 0 : 0.5), tg.y + (tg.size ? 0 : 0.5)); vx = tx - sx; vy = ty - sy; }
    }
    u._lx = u.x; u._ly = u.y;
    if (vx || vy) { const m = Math.hypot(vx, vy) || 1; u._dx = (u._dx ?? vx / m) * 0.8 + (vx / m) * 0.2; u._dy = (u._dy ?? vy / m) * 0.8 + (vy / m) * 0.2; }
    if (u._dx == null) { u._dx = u.face >= 0 ? 0.8 : -0.8; u._dy = 0.2; }
    const sgn = u._dx > 0.06 ? 1 : u._dx < -0.06 ? -1 : (u._sg || 1); u._sg = sgn;
    const away = u._dy < -0.42, toward = u._dy > 0.5;
    const tgtX = sgn * (1 - 0.26 * Math.min(1, Math.abs(u._dy)) ) * (toward ? 1.04 : 1);
    u._fx = (u._fx ?? tgtX) + (tgtX - (u._fx ?? tgtX)) * Math.min(1, dtF * 16);
    const flip = u._fx > 0, sxScale = Math.abs(u._fx), light = away ? 0.7 : 1;
    const striking = st.dmg > 0 && u.cooldown > st.cd - 0.25;
    const working = !moving && (u.task.type === 'gather' || u.task.type === 'build' || u.task.type === 'mine');
    let c, w, h;
    if (u.kind === 'ram') { c = ramSprite(u.team); w = 78 * z; }
    else if (u.kind === 'camel') { c = camelSprite(u.team); w = 62 * z; }
    else if (u.kind === 'serf') { c = tinted(working && (Math.floor(t * 2 + u.id) & 1) ? 'serf_dig2' : 'serf_dig1', u.team, 'trim', false, light); w = (c ? c.width / c.height : 1) * 40 * z; }
    else { c = tinted(st.art || u.kind, u.team, 'trim', false, light); const hh = USCALE[u.kind] * z; w = (c ? c.width / c.height : 1) * hh; }
    if (!c) return;
    h = (c.height / c.width) * w;
    const bob = moving ? Math.abs(Math.sin(u.anim * 0.55)) * 3 * z : working ? Math.abs(Math.sin(t * 6 + u.id)) * 1.5 * z : 0;
    const lunge = striking ? 5 * z * (u.cooldown > st.cd - 0.12 ? 1 : 0.5) : 0;
    this.shadowAt(ctx, sx, sy + 1 * z, w * 0.3, 4.5 * z, 0.34);
    ctx.save();
    ctx.translate(sx + (flip ? lunge : -lunge), sy);
    ctx.rotate(moving ? Math.sin(u.anim * 0.55) * 0.045 : 0);
    ctx.scale(flip ? -sxScale : sxScale, 1);
    const foot = u.kind === 'ram' || u.kind === 'serf' || u.kind === 'camel' ? 1.0 : 0.9;
    ctx.drawImage(c, -w / 2, -h * foot - bob, w, h);
    if (u.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.6, u.flash * 2); ctx.drawImage(c, -w / 2, -h * foot - bob, w, h); }
    ctx.restore();
    this.hit(u, 'unit', sx - w * 0.4, sy - h * foot - bob, sx + w * 0.4, sy + 3 * z);
    if (u.carry && u.carry.amount > 0.5) { ctx.fillStyle = { food: '#c23a56', wood: '#8a5a2a', gold: GOLD }[u.carry.kind]; ctx.strokeStyle = '#1b130b'; ctx.lineWidth = 1; const bx = sx + (flip ? -1 : 1) * w * 0.3, by = sy - h * 0.75 - bob; ctx.fillRect(bx - 4 * z, by, 8 * z, 7 * z); ctx.strokeRect(bx - 4 * z, by, 8 * z, 7 * z); }
    if (ui?.isSelected(u)) { ctx.strokeStyle = '#f0e2a0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, sy + 1 * z, 15 * z, 7.5 * z, 0, 0, 7); ctx.stroke(); }
    if (u.hp < u.maxHp || ui?.isSelected(u)) { const bw = Math.max(20, w * 0.7); this.bar(ctx, sx - bw / 2, sy - h * foot - 8 - bob, bw, 3, u.hp / u.maxHp, this.hpColor(u.hp / u.maxHp)); }
  }

  bar(ctx, x, y, w, h, r, color) {
    ctx.fillStyle = '#1b130b'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, r)), h);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  hpColor(r) { return r > 0.5 ? '#6dbf6a' : r > 0.25 ? '#d4b44a' : '#cc4444'; }

  ghost(ctx, g, ui) {
    const s = BUILDINGS[ui.placing].size, tx = ui.hoverTX, ty = ui.hoverTY;
    const chk = g.canPlace(PLAYER, ui.placing, tx, ty);
    this.diamond(ctx, tx, ty, s, s);
    ctx.fillStyle = chk.ok ? 'rgba(110,200,110,0.38)' : 'rgba(210,70,70,0.4)'; ctx.fill();
    ctx.strokeStyle = chk.ok ? '#8fe08f' : '#e07070'; ctx.lineWidth = 2; ctx.stroke();
    const [name, mul] = BSPR[ui.placing] || ['cottage', 1], c = tinted(name, PLAYER, 'banner');
    if (c) { const [bx, by] = this.toScreen(tx + s, ty + s), w = s * 2 * HW * this.cam.zoom * mul, h = (c.height / c.width) * w; ctx.globalAlpha = 0.55; ctx.drawImage(c, bx - w / 2, by - h + s * HH * this.cam.zoom * 0.34, w, h); ctx.globalAlpha = 1; }
    const [lx, ly] = this.toScreen(tx + s / 2, ty);
    ctx.font = 'bold 13px Georgia, serif'; ctx.textAlign = 'center';
    let note = '';
    if (chk.ok) {
      const cx = tx + s / 2, cy = ty + s / 2; let ds = 1e9, db = 1e9;
      for (const b of g.buildings) if (b.team === PLAYER && b.hp > 0 && b.built >= 1) { const d = Math.hypot(b.x - cx, b.y - cy); db = Math.min(db, d); if (STORES.includes(b.kind)) ds = Math.min(ds, d); }
      if (ui.placing === 'mine' && ds > HAUL.free) note = ` · yield ${Math.round(100 * (ds >= HAUL.far ? HAUL.min : 1 - (1 - HAUL.min) * (ds - HAUL.free) / (HAUL.far - HAUL.free)))}% (far from a store)`;
      else if (db > 30) note = ' · remote: no villagers near, no guard';
    }
    const label = chk.ok ? BUILDINGS[ui.placing].label + note : `${BUILDINGS[ui.placing].label}: ${chk.reason}`;
    ctx.fillStyle = '#000'; ctx.fillText(label, lx + 1, ly - 3); ctx.fillStyle = chk.ok ? '#d9f5d0' : '#ffc4c0'; ctx.fillText(label, lx, ly - 4);
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
        c = GROUND_RGB[t] || GROUND_RGB[0];
        if (g.fogOn && !vis[i]) c = [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55];
      }
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
    for (const n of g.resources) if (n.amount > 0 && (n.kind === 'gold' || MATS.includes(n.kind)) && (!g.fogOn || seen[n.y * W + n.x])) { const o = (n.y * W + n.x) * 4; const col = n.kind === 'gold' ? [240, 200, 70] : n.kind === 'stone' ? [170, 170, 160] : n.kind === 'copper' ? [214, 120, 60] : n.kind === 'iron' ? [120, 140, 170] : n.kind === 'coal' ? [30, 30, 36] : [225, 235, 250]; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; }
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
    const q = this.r.viewPoly();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); q.forEach(([x, y], i) => (i ? ctx.lineTo(x * sx, y * sy) : ctx.moveTo(x * sx, y * sy))); ctx.closePath(); ctx.stroke();
  }
}

// ---------------------------------------------------------------- vale preview (menu) and campaign map
export function drawVale(canvas, game, { fog = false, poly = null, labels = false } = {}) {
  const ctx = canvas.getContext('2d'), W = game.W, H = game.H, cw = canvas.width, ch = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const sx = cw / W, sy = ch / H;
  const seen = game.seen[PLAYER], vis = game.vis[PLAYER];
  ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, cw, ch);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (fog && game.fogOn && !seen[i]) continue;
    const t = game.terrain[i];
    let c = t === T_GRASS ? [[102, 106, 44], [106, 110, 46], [96, 100, 40], [112, 114, 50]][(hash(x, y) * 4) | 0] : GROUND_RGB[t] || GROUND_RGB[0];
    if (fog && game.fogOn && !vis[i]) c = c.map((q) => q * 0.55);
    ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
    ctx.fillRect(x * sx, y * sy, sx + 0.6, sy + 0.6);
  }
  for (const n of game.resources) {
    if (n.amount <= 0 || (fog && game.fogOn && !seen[n.y * W + n.x])) continue;
    ctx.fillStyle = n.kind === 'gold' ? '#f0c84a' : n.kind === 'tree' ? '#1f4a24' : n.kind === 'berry' ? '#b0344f' : GOOD_COLOR[n.kind] || '#999';
    const r = n.kind === 'gold' ? Math.max(2.2, sx * 0.7) : MATS.includes(n.kind) ? Math.max(1.8, sx * 0.6) : Math.max(1.2, sx * 0.45);
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
  if (poly) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); poly.forEach(([x, y], i) => (i ? ctx.lineTo(x * sx, y * sy) : ctx.moveTo(x * sx, y * sy))); ctx.closePath(); ctx.stroke();
  }
}
function drawDisc(ctx, cx, cy, r, team) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = HOUSES[team].accent; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.66, 0, 7); ctx.fillStyle = HOUSES[team].primary; ctx.fill();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
}
