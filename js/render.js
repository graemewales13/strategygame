// Seven Holds - canvas drawing. Reads game state, never changes it.
import {
  TILE, PLAYER, HOUSES, T_GRASS, T_DIRT, T_WATER, T_FORD, UNITS, BUILDINGS, NODE_RES, TERRITORY, VILLAGE_KINDS,
} from './config.js';
import { TerrainCache, FogLayer } from './terrain.js';
import { buildingSprite, villageSprite, treeSprite, goldSprite, berrySprite, unitSprite, U, FRAMES } from './sprites.js';

const hash = (x, y) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
const GRASS = ['#4d7b3b', '#527f3e', '#4a7637', '#578440'];
const GOLD = '#e2c15e';

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.terrain = new TerrainCache(game);
    this.fog = new FogLayer(game);
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

    // terrain: cached painted chunks, then a little animated water on top
    this.terrain.draw(ctx, this.cam, P, this.w, this.h);
    this.shimmer(ctx, g, x0, y0, x1, y1, P, t, isSeen);
    // ownership glow under territory when placing
    if (ui?.placing) this.territory(ctx, g, P);

    // everything that stands on the ground is drawn back to front
    const items = [];
    for (const n of g.resources) {
      if (n.amount <= 0 || n.x < x0 - 1 || n.x > x1 || n.y < y0 - 2 || n.y > y1 + 1 || !isSeen(n.x, n.y)) continue;
      items.push({ o: n, k: 0, z: n.y + 1 });
    }
    for (const v of g.villages) if (isSeen(v.x, v.y) && v.tx + v.size >= x0 - 1 && v.tx <= x1 && v.ty + v.size >= y0 - 2 && v.ty <= y1 + 2) items.push({ o: v, k: 1, z: v.ty + v.size });
    for (const b of g.buildings) if ((b.team === PLAYER || isSeen(b.x, b.y)) && b.tx + b.size >= x0 - 1 && b.tx <= x1 && b.ty + b.size >= y0 - 2 && b.ty <= y1 + 2) items.push({ o: b, k: 2, z: b.ty + b.size });
    for (const u of g.units) {
      if (u.hp <= 0 || u.hidden || !(u.team === PLAYER || isVis(u.x, u.y))) continue;
      if (u.x < x0 - 1 || u.x > x1 || u.y < y0 - 1 || u.y > y1 + 1) continue;
      items.push({ o: u, k: 3, z: u.y + 0.35 });
    }
    items.sort((a, b) => a.z - b.z);
    for (const it of items) {
      const e = it.o;
      if (it.k === 0) { const [sx, sy] = this.toScreen(e.x, e.y); this.node(ctx, e, sx, sy, P, isVis(e.x, e.y)); }
      else if (it.k === 1) { const [sx, sy] = this.toScreen(e.tx, e.ty); this.village(ctx, e, sx, sy, P, !(e.owner === PLAYER) && !isVis(e.x, e.y), ui); }
      else if (it.k === 2) { const [sx, sy] = this.toScreen(e.tx, e.ty); this.building(ctx, e, sx, sy, P, e.team !== PLAYER && !isVis(e.x, e.y), ui, t); }
      else { const [sx, sy] = this.toScreen(e.x, e.y); this.unit(ctx, e, sx, sy, P, ui); }
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

    // fog: soft alpha layer (unknown = black, remembered = dim)
    this.fog.update();
    this.fog.draw(ctx, this.cam, P);

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
  shimmer(ctx, g, x0, y0, x1, y1, P, t, isSeen) {
    ctx.lineWidth = Math.max(1, P * 0.04);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (g.terrain[y * g.W + x] !== T_WATER || !isSeen(x, y)) continue;
      const h = hash(x, y), ph = t * (0.9 + h * 0.5) + h * 40, a = 0.1 + 0.16 * Math.max(0, Math.sin(ph));
      if (a < 0.12) continue;
      const [sx, sy] = this.toScreen(x, y), ox = Math.sin(ph * 0.7) * P * 0.12;
      ctx.strokeStyle = `rgba(215,240,250,${a})`;
      ctx.beginPath(); ctx.moveTo(sx + P * (0.2 + h * 0.2) + ox, sy + P * (0.3 + h * 0.4)); ctx.quadraticCurveTo(sx + P * 0.5 + ox, sy + P * (0.25 + h * 0.4), sx + P * (0.75 + h * 0.1) + ox, sy + P * (0.3 + h * 0.4)); ctx.stroke();
    }
  }
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
    const k = P / U, a = vis ? 1 : 0.62;
    const h = hash(n.x, n.y);
    const sp = n.kind === 'tree' ? treeSprite((h * 5) | 0) : n.kind === 'gold' ? goldSprite((h * 3) | 0) : berrySprite((h * 3) | 0);
    const sc = n.kind === 'tree' ? 0.95 + h * 0.2 : n.kind === 'gold' ? 1.1 : 1.0;
    if (!vis) ctx.globalAlpha = a;
    ctx.drawImage(sp.cv, sx + P / 2 - sp.ax * k * sc, sy + P * 0.96 - sp.ay * k * sc, sp.cv.width * k * sc, sp.cv.height * k * sc);
    if (!vis) ctx.globalAlpha = 1;
  }

  // wavy pennant on a pole whose top is at (px, py)
  pennant(ctx, px, py, P, t, prim, acc, phase = 0) {
    const w = P * 0.5, h = P * 0.3;
    ctx.fillStyle = prim; ctx.beginPath(); ctx.moveTo(px + 1, py + 1);
    const n = 6;
    for (let i = 1; i <= n; i++) ctx.lineTo(px + (w * i) / n, py + 1 + Math.sin(t * 4 + phase + i * 0.9) * h * 0.14 * (i / n));
    for (let i = n; i >= 0; i--) ctx.lineTo(px + (w * i) / n * (i === n ? 0.82 : 1), py + h + Math.sin(t * 4 + phase + i * 0.9) * h * 0.14 * (i / n));
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = acc; ctx.lineWidth = Math.max(1, P * 0.035); ctx.stroke();
  }
  smoke(ctx, x, y, P, t, seed) {
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.32 + i / 4 + seed * 0.37) % 1;
      ctx.fillStyle = `rgba(210,208,200,${0.34 * (1 - ph)})`;
      ctx.beginPath(); ctx.arc(x + Math.sin(ph * 5 + seed) * P * 0.08 + ph * P * 0.18, y - ph * P * 0.95, P * (0.05 + ph * 0.13), 0, 7); ctx.fill();
    }
  }

  // ---------------------------------------------------------------- villages
  village(ctx, v, sx, sy, P, dim, ui) {
    const sp = villageSprite(v.kind, v.owner), k = P / U, f = v.owner >= 0 ? HOUSES[v.owner] : null;
    const VS = 1.5, S = v.size * P, w = sp.cv.width * k * VS, h = sp.cv.height * k * VS, dy = sy + S * 1.04 - h, dx = sx + S / 2 - w / 2 + S * 0.04, t = performance.now() / 1000;
    ctx.save();
    if (dim) ctx.globalAlpha = 0.75;
    ctx.drawImage(sp.cv, dx, dy, w, h);
    if (v.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, v.flash); ctx.drawImage(sp.cv, dx, dy, w, h); ctx.globalCompositeOperation = 'source-over'; }
    ctx.restore();
    const m = sp.meta;
    if (m.smoke && !dim) m.smoke.forEach(([fx, fy], i) => this.smoke(ctx, dx + fx * sp.S * k * VS, dy + (fy * sp.S + sp.rise) * k * VS, P, t, v.id + i));
    this.pennant(ctx, dx + m.flag[0] * sp.S * k * VS, dy + (m.flag[1] * sp.S + sp.rise) * k * VS, P, t, f ? f.primary : '#9a8f70', f ? f.accent : '#d8cba2', v.id);
    // bars: protection (red), loyalty (blue)
    const top = dy - 2;
    this.bar(ctx, sx, top - 8, S, 4, v.protection / v.maxProtection, '#c0473b');
    this.bar(ctx, sx, top - 3, S, 4, v.loyalty / 100, '#5a9ad8');
    if (ui?.isSelected(v)) { ctx.strokeStyle = '#f0e2a0'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.ellipse(sx + S / 2, sy + S * 0.66, S * 0.56, S * 0.42, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    if (P > 20) { ctx.font = `${Math.round(11 * this.cam.zoom + 2)}px Georgia, serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#000'; ctx.fillText(v.name, sx + S / 2 + 1, sy + S + 22); ctx.fillStyle = '#f0e2b6'; ctx.fillText(v.name, sx + S / 2, sy + S + 21); }
  }

  // ---------------------------------------------------------------- buildings
  building(ctx, b, sx, sy, P, dim, ui, t) {
    const sp = buildingSprite(b.kind, b.team, b.size), k = P / U, f = HOUSES[b.team], prog = b.built;
    const BS = 1.28, S = b.size * P, w = sp.cv.width * k * BS, h = sp.cv.height * k * BS, dy = sy + S * 1.04 - h, dx = sx + S / 2 - w / 2 + S * 0.02;
    // team plate: a tinted footing so a house colour reads at a glance
    ctx.fillStyle = f.primary; ctx.globalAlpha = 0.22; ctx.beginPath(); ctx.ellipse(sx + S * 0.52, sy + S * 0.9, S * 0.56, S * 0.17, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.save();
    if (dim) ctx.globalAlpha = 0.78;
    if (prog < 1) {
      const r = 0.18 + 0.82 * prog;
      ctx.beginPath(); ctx.rect(dx - 4, dy + h * (1 - r), w + 8, h * r + 2); ctx.clip();
      ctx.globalAlpha = (dim ? 0.78 : 1) * 0.92; ctx.drawImage(sp.cv, dx, dy, w, h);
    } else ctx.drawImage(sp.cv, dx, dy, w, h);
    ctx.restore();
    const m = sp.meta, X = (fx) => dx + fx * sp.S * k * BS, Y = (fy) => dy + (fy * sp.S + sp.full) * k * BS;
    if (prog < 1) {
      // scaffolding
      const top = dy + h * (1 - (0.18 + 0.82 * prog)) + 4;
      ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = Math.max(2, P * 0.06);
      for (const fx of [0.02, 0.5, 0.96]) { ctx.beginPath(); ctx.moveTo(X(fx) + 0, sy + S); ctx.lineTo(X(fx), top); ctx.stroke(); }
      ctx.lineWidth = Math.max(1.5, P * 0.045);
      for (let y = sy + S - S * 0.2; y > top; y -= S * 0.22) { ctx.beginPath(); ctx.moveTo(X(0.02), y); ctx.lineTo(X(0.96), y); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(255,230,160,.55)'; ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]); ctx.strokeRect(sx + 1, sy + 1, S - 2, S - 2); ctx.setLineDash([]);
      this.bar(ctx, sx, sy + S + 3, S, 5, prog, '#e2c15e');
    } else if (!dim) {
      if (m.smoke) m.smoke.forEach(([fx, fy], i) => this.smoke(ctx, X(fx), Y(fy), P, t, b.id + i));
      if (m.glow) { const gx = X(m.glow[0]), gy = Y(m.glow[1]), gr = P * 0.5, a = 0.5 + Math.sin(t * 9 + b.id) * 0.12 + Math.sin(t * 23) * 0.06; const g2 = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr); g2.addColorStop(0, `rgba(255,190,80,${a})`); g2.addColorStop(1, 'rgba(255,120,30,0)'); ctx.fillStyle = g2; ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2); }
    }
    if (m.flag && prog >= 1) this.pennant(ctx, X(m.flag[0]), Y(m.flag[1]), P, t, f.primary, f.accent, b.id);
    if (b.flash > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, b.flash * 2); ctx.drawImage(sp.cv, dx, dy, w, h); ctx.restore(); }
    if (b.hp < b.maxHp && prog >= 1) this.bar(ctx, sx, dy - 6, S, 4, b.hp / b.maxHp, this.hpColor(b.hp / b.maxHp));
    if (b.queue.length && b.team === PLAYER) this.bar(ctx, sx, sy + S + 2, S, 3, b.queue[0].t / UNITS[b.queue[0].kind].time, '#7ac1ff');
    if (ui?.isSelected(b)) { ctx.strokeStyle = '#f0e2a0'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.ellipse(sx + S * 0.52, sy + S * 0.9, S * 0.58, S * 0.2, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    if (ui?.isSelected(b) && b.rally) { const [rx, ry] = this.toScreen(b.rally.x, b.rally.y); ctx.strokeStyle = f.accent; ctx.beginPath(); ctx.moveTo(sx + S / 2, sy + S / 2); ctx.lineTo(rx, ry); ctx.stroke(); ctx.fillStyle = f.accent; ctx.fillRect(rx - 1, ry - 12, 2, 12); ctx.fillRect(rx + 1, ry - 12, 8, 5); }
  }

  // ---------------------------------------------------------------- units
  unit(ctx, u, sx, sy, P, ui) {
    const st = UNITS[u.kind], k = P / U * (u.kind === 'ram' || u.kind === 'knight' ? 1.1 : 1.2), fc = u.face || 1;
    const moving = u.path.length > 0;
    let frame = Math.floor(u.anim * 0.75) % 4;
    if (!moving) frame = 0;
    const striking = u.cooldown > st.cd - 0.3 && st.dmg > 0;
    if (striking) frame = u.cooldown > st.cd - 0.13 ? 5 : 4;
    else if (!moving && u.task.type === 'gather' && u.anim > 0) frame = 4 + (Math.floor(u.anim * 0.9) & 1);
    else if (!moving && u.task.type === 'build') frame = 4 + (Math.floor(u.anim * 0.9) & 1);
    const sp = unitSprite(u.kind, u.team, frame), fy = sy + P * 0.32;
    const w = sp.cv.width * k, h = sp.cv.height * k;
    ctx.fillStyle = 'rgba(8,14,6,0.33)'; ctx.beginPath(); ctx.ellipse(sx, fy, w * 0.26, P * 0.08, 0, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(sx, fy - sp.ay * k); if (fc < 0) ctx.scale(-1, 1);
    ctx.drawImage(sp.cv, -sp.ax * k, 0, w, h);
    if (u.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.9, u.flash * 2); ctx.drawImage(sp.cv, -sp.ax * k, 0, w, h); }
    ctx.restore();
    if (u.carry && u.carry.amount > 0.5) { ctx.fillStyle = { food: '#c23a56', wood: '#8a5a2a', gold: GOLD }[u.carry.kind]; ctx.strokeStyle = '#1b130b'; ctx.lineWidth = 1; const bx = sx - fc * P * 0.2, by = fy - P * 0.52; ctx.fillRect(bx - P * 0.07, by, P * 0.14, P * 0.12); ctx.strokeRect(bx - P * 0.07, by, P * 0.14, P * 0.12); }
    if (ui?.isSelected(u)) { ctx.strokeStyle = '#f0e2a0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, fy, w * 0.3, P * 0.12, 0, 0, 7); ctx.stroke(); }
    if (u.hp < u.maxHp || ui?.isSelected(u)) { const bw = Math.max(18, w * 0.5); this.bar(ctx, sx - bw / 2, fy - (u.kind === 'knight' ? 82 : u.kind === 'ram' ? 56 : 62) * k - 6, bw, 3, u.hp / u.maxHp, this.hpColor(u.hp / u.maxHp)); }
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
