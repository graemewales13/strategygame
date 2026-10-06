// Auld World - painted terrain and soft fog. Both are cached on offscreen canvases; render.js only blits them.
import { PLAYER, T_GRASS, T_DIRT, T_WATER, T_FORD, T_DRY, T_SAND, T_ROCK, T_SNOW } from './config.js';
import { TILES } from './art.js';
import { gfx } from './gfx.js';

const TS = 32;      // texture pixels per tile
const CH = 16;      // tiles per chunk edge
const hash = (x, y, s = 0) => { let n = Math.imul(x + s * 7919, 374761393) + Math.imul(y - s * 104729, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// smooth value noise for large-scale colour drift
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, 3), b = hash(xi + 1, yi, 3), c = hash(xi, yi + 1, 3), d = hash(xi + 1, yi + 1, 3);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export class TerrainCache {
  constructor(game) {
    this.g = game;
    this.chunks = new Map();
    this.cw = Math.ceil(game.W / CH); this.ch = Math.ceil(game.H / CH);
  }
  isWater(x, y) { const g = this.g; if (x < 0 || y < 0 || x >= g.W || y >= g.H) return false; const t = g.terrain[y * g.W + x]; return t === T_WATER || t === T_FORD; }
  type(x, y) { const g = this.g; if (x < 0 || y < 0 || x >= g.W || y >= g.H) return -1; return g.terrain[y * g.W + x]; }

  chunk(cx, cy) {
    if (this.terrainRef !== this.g.terrain) { this.chunks.clear(); this.terrainRef = this.g.terrain; }   // a new valley repaints
    const key = cy * this.cw + cx;
    let c = this.chunks.get(key);
    if (!c) { c = this.paint(cx, cy); this.chunks.set(key, c); }
    return c;
  }

  paint(cx, cy) {
    const g = this.g, N = CH + 2, size = N * TS; // 1-tile margin so neighbours overlap without seams
    const cv = mk(size, size), ctx = cv.getContext('2d');
    const tx0 = cx * CH - 1, ty0 = cy * CH - 1;
    const ox = -tx0 * TS, oy = -ty0 * TS;
    const px = (tx) => ox + tx * TS, py = (ty) => oy + ty * TS;
    const jit = (x, y) => [(hash(x, y, 11) - 0.5) * TS * 0.26, (hash(x, y, 12) - 0.5) * TS * 0.26];
    const ctr = (x, y) => { const [jx, jy] = jit(x, y); return [px(x) + TS / 2 + jx, py(y) + TS / 2 + jy]; };
    const range = [tx0 - 2, tx0 + N + 2, ty0 - 2, ty0 + N + 2];

    // ---- ground: the painted tiles from the terrain sheet, stamped through the inverse of the iso projection,
    // back to front so the rocks that rise above their tile are overlapped correctly
    ctx.fillStyle = '#6f7a38'; ctx.fillRect(0, 0, size, size);
    const KIND = { [T_GRASS]: 'grass', [T_DRY]: 'dry', [T_SAND]: 'sand', [T_ROCK]: 'rock', [T_DIRT]: 'dirt', [T_SNOW]: 'snow', [T_WATER]: 'grass', [T_FORD]: 'grass' };
    const PLAIN_DIRT = [0, 1, 4, 5];
    const stamp = (x, y) => {
      let t = this.type(x, y);
      if (t < 0) { // off the map: continue the nearest ground so the edge has no hole
        t = this.type(Math.max(0, Math.min(g.W - 1, x)), Math.max(0, Math.min(g.H - 1, y)));
      }
      const set = TILES[KIND[t]]; if (!set || !set.length) return;
      const h = hash(x, y, 5);
      const img = set[t === T_DIRT ? PLAIN_DIRT[(h * 4) | 0] % set.length : Math.min(set.length - 1, (h * set.length) | 0)];
      if (!img) return;
      const X = px(x), Y = py(y), w = img.width, hh = img.height;
      ctx.save();
      ctx.translate(X + TS / 2, Y + TS / 2); ctx.scale(1.035, 1.035); ctx.translate(-(X + TS / 2), -(Y + TS / 2));
      ctx.transform(TS / w, -TS / w, TS / hh, TS / hh, X - TS / 2, Y + TS / 2);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    };
    for (let d = tx0 + ty0 - 2; d < tx0 + ty0 + 2 * N + 2; d++) for (let x = tx0 - 1; x < tx0 + N + 1; x++) { const y = d - x; if (y >= ty0 - 1 && y < ty0 + N + 1) stamp(x, y); }
    // soften the seams where one ground meets another: a short fade of the neighbour's average colour
    const AVG = this.avg || (this.avg = {});
    const avgOf = (t) => {
      if (AVG[t]) return AVG[t];
      const set = TILES[KIND[t]], img = set && set[0]; if (!img) return [110, 120, 60];
      const c1 = mk(1, 1), x1 = c1.getContext('2d'); x1.drawImage(img, 0, 0, 1, 1);
      const d = x1.getImageData(0, 0, 1, 1).data; return (AVG[t] = [d[0], d[1], d[2]]);
    };
    for (let y = ty0; y < ty0 + N; y++) for (let x = tx0; x < tx0 + N; x++) {
      const t = this.type(x, y); if (t < 0 || t === T_ROCK || t === T_WATER || t === T_FORD) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = this.type(x + dx, y + dy);
        if (n < 0 || n === t || n === T_ROCK || n === T_WATER || n === T_FORD) continue;
        const [r, gg, b] = avgOf(n), bx = px(x) + TS / 2 + dx * TS * 0.5 + (hash(x, y, 8) - 0.5) * 6, by = py(y) + TS / 2 + dy * TS * 0.5 + (hash(x, y, 9) - 0.5) * 6;
        const gr = ctx.createRadialGradient(bx, by, 0, bx, by, TS * 0.62);
        gr.addColorStop(0, `rgba(${r | 0},${gg | 0},${b | 0},0.62)`); gr.addColorStop(1, `rgba(${r | 0},${gg | 0},${b | 0},0)`);
        ctx.fillStyle = gr; ctx.fillRect(bx - TS, by - TS, TS * 2, TS * 2);
      }
    }

    // ---- hide the tile grid: blend a heavily blurred copy of the ground over itself (not over rock tiles, so the stone keeps its edges).
    // The painted tiles differ in brightness, which reads as a diamond checkerboard; this melts it into continuous country.
    if (gfx.q >= 1) {
      const orig = mk(size, size); orig.getContext('2d').drawImage(cv, 0, 0);
      let src = cv, sw = size;
      while (sw > 80) { const nw = Math.max(80, sw >> 1), c2 = mk(nw, nw), x2 = c2.getContext('2d'); x2.imageSmoothingQuality = 'high'; x2.drawImage(src, 0, 0, nw, nw); src = c2; sw = nw; }
      ctx.save(); ctx.beginPath();
      for (let y = ty0; y < ty0 + N; y++) for (let x = tx0; x < tx0 + N; x++) { const t = this.type(x, y); if (t !== T_ROCK && t !== T_WATER && t !== T_FORD) ctx.rect(px(x) - 0.5, py(y) - 0.5, TS + 1, TS + 1); }
      ctx.clip(); ctx.globalAlpha = 0.82; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, size, size);
      ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.85; ctx.drawImage(orig, 0, 0);   // put the painted texture's fine contrast back on top of the smoothed colour
      ctx.restore();
    }
    // ---- relief: a made-up height field lit from the upper left, so the land rolls in soft rises and hollows
    if (gfx.q >= 1) {
      const H = (x, y) => vnoise(x * 0.045 + 7, y * 0.045 + 3) * 0.65 + vnoise(x * 0.13, y * 0.13 + 20) * 0.35;
      for (let y = ty0; y < ty0 + N; y++) for (let x = tx0; x < tx0 + N; x++) {
        const t = this.type(x, y); if (t < 0 || t === T_WATER || t === T_FORD || t === T_ROCK) continue;
        const sh = H(x - 1, y - 1) - H(x + 1, y + 1), a = Math.min(0.34, Math.abs(sh) * 3.4); if (a < 0.03) continue;
        const [cxp, cyp] = ctr(x, y), gr = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, TS * 1.15), c = sh > 0 ? '255,244,205' : '24,26,40';
        gr.addColorStop(0, `rgba(${c},${a})`); gr.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = gr; ctx.fillRect(cxp - TS * 1.15, cyp - TS * 1.15, TS * 2.3, TS * 2.3);
      }
    }
    // ---- dunes: long curved crests across the sand and dry ground, light on the lit side, dark in the lee
    if (gfx.q >= 1) {
      ctx.lineCap = 'round';
      for (let y = ty0; y < ty0 + N; y++) for (let x = tx0; x < tx0 + N; x++) {
        const t = this.type(x, y); if (t !== T_SAND && t !== T_DRY) continue;
        const n = vnoise(x * 0.09 + 50, y * 0.09 + 11); if (n < 0.5 || hash(x, y, 140) > 0.55) continue;
        const [cxp, cyp] = ctr(x, y), L = TS * (0.9 + hash(x, y, 141) * 1.1), bend = (hash(x, y, 142) - 0.5) * TS * 0.6;
        ctx.lineWidth = 2.4; ctx.strokeStyle = 'rgba(40,28,10,.16)'; ctx.beginPath(); ctx.moveTo(cxp - L / 2, cyp + 3); ctx.quadraticCurveTo(cxp, cyp + 3 + bend, cxp + L / 2, cyp + 3); ctx.stroke();
        ctx.lineWidth = 1.8; ctx.strokeStyle = 'rgba(255,240,196,.3)'; ctx.beginPath(); ctx.moveTo(cxp - L / 2, cyp - 1); ctx.quadraticCurveTo(cxp, cyp - 1 + bend, cxp + L / 2, cyp - 1); ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }

    // ---- large-scale variation: soft lush / parched patches drifting across the ground, so a wide plain never shows its tile repeat
    if (gfx.q >= 1) {
      for (let y = ty0; y < ty0 + N; y++) for (let x = tx0; x < tx0 + N; x++) {
        const t = this.type(x, y); if (t < 0 || t === T_WATER || t === T_FORD || t === T_ROCK) continue;
        const n = vnoise(x * 0.06, y * 0.06) * 0.65 + vnoise(x * 0.19 + 40, y * 0.19 + 9) * 0.35, m = n - 0.5;
        if (Math.abs(m) < 0.06) continue;
        const [cxp, cyp] = ctr(x, y), a = Math.min(0.2, (Math.abs(m) - 0.06) * 0.7);
        const col = m > 0 ? (t === T_SAND || t === T_DRY ? '214,176,96' : '70,120,34') : (t === T_GRASS ? '168,150,70' : '120,96,56');
        const gr = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, TS * 1.1);
        gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = gr; ctx.fillRect(cxp - TS * 1.1, cyp - TS * 1.1, TS * 2.2, TS * 2.2);
      }
    }
    // ---- ragged biome edges: extra jittered blobs of the neighbour's colour along each seam (high quality)
    if (gfx.q >= 2) {
      for (let y = ty0; y < ty0 + N; y++) for (let x = tx0; x < tx0 + N; x++) {
        const t = this.type(x, y); if (t < 0 || t === T_ROCK || t === T_WATER || t === T_FORD) continue;
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const n = this.type(x + dx, y + dy); if (n < 0 || n === t || n === T_ROCK || n === T_WATER || n === T_FORD) continue;
          for (let k = 0; k < 3; k++) {
            const h1 = hash(x, y, 80 + k + dx * 3), h2 = hash(x, y, 90 + k + dy * 3), along = (k + 0.5) / 3 + (h1 - 0.5) * 0.25;
            const bx = px(x) + (dx ? TS : along * TS) + (dx ? (h2 - 0.5) * TS * 0.5 : 0), by = py(y) + (dy ? TS : along * TS) + (dy ? (h2 - 0.5) * TS * 0.5 : 0);
            const [r, gg, b] = avgOf(h1 > 0.5 ? n : t), rad = TS * (0.3 + h2 * 0.35);
            const gr = ctx.createRadialGradient(bx, by, 0, bx, by, rad);
            gr.addColorStop(0, `rgba(${r | 0},${gg | 0},${b | 0},0.55)`); gr.addColorStop(1, `rgba(${r | 0},${gg | 0},${b | 0},0)`);
            ctx.fillStyle = gr; ctx.fillRect(bx - rad, by - rad, rad * 2, rad * 2);
          }
        }
      }
    }

    // ---- river: sand shore, shallows, then deep water. Same trick as trails: round-capped strokes between tile centres
    const waterLinks = (fn) => {
      for (let y = range[2]; y < range[3]; y++) for (let x = range[0]; x < range[1]; x++) {
        if (!this.isWater(x, y)) continue;
        const [ax, ay] = ctr(x, y);
        fn(ax, ay, ax, ay, x, y);
        for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) if (this.isWater(x + dx, y + dy)) { const [bx, by] = ctr(x + dx, y + dy); fn(ax, ay, bx, by, x, y); }
      }
    };
    const wstroke = (col, w, alpha = 1) => { ctx.strokeStyle = col; ctx.globalAlpha = alpha; ctx.lineWidth = w; waterLinks((ax, ay, bx, by) => { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx + 0.01, by); ctx.stroke(); }); ctx.globalAlpha = 1; };
    wstroke('#2e3a1c', TS * 2.35, 0.22);   // damp bank
    wstroke('#cdb47c', TS * 2.0, 1);        // sand
    wstroke('#e0cb93', TS * 1.85, 1);       // dry sand
    wstroke('#4f8490', TS * 1.7, 1);        // shallows
    wstroke('#3a6f86', TS * 1.38, 1);
    wstroke('#2f5f7a', TS * 0.98, 1);       // deep
    wstroke('#274f69', TS * 0.55, 0.9);
    // lighter ripples baked in
    ctx.lineWidth = 1.2;
    for (let y = ty0; y < ty0 + N; y++) for (let x = tx0; x < tx0 + N; x++) {
      if (this.type(x, y) !== T_WATER) continue;
      const h = hash(x, y, 50);
      ctx.strokeStyle = `rgba(200,235,245,${0.1 + h * 0.12})`;
      const [cxp, cyp] = ctr(x, y);
      ctx.beginPath(); ctx.moveTo(cxp - 8, cyp + (h - 0.5) * 10); ctx.quadraticCurveTo(cxp, cyp + (h - 0.5) * 10 - 3, cxp + 8, cyp + (h - 0.5) * 10); ctx.stroke();
    }
    // shore pebbles + reeds
    for (let y = ty0; y < ty0 + N; y++) for (let x = tx0; x < tx0 + N; x++) {
      if (this.type(x, y) === T_WATER || this.type(x, y) === T_FORD) continue;
      let near = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.isWater(x + dx, y + dy)) near++;
      if (!near) continue;
      const h = hash(x, y, 60);
      if (h < 0.55) { ctx.strokeStyle = 'rgba(70,84,30,.85)'; ctx.lineWidth = 1.5; const bx = px(x) + hash(x, y, 61) * TS, by = py(y) + hash(x, y, 62) * TS; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(bx + k * 2.5, by); ctx.lineTo(bx + k * 4, by - 9 - h * 7); ctx.stroke(); } }
    }

    // ---- fords: gravel bar with stepping stones, a plank walkway on top
    for (let y = ty0 - 1; y < ty0 + N + 1; y++) for (let x = tx0 - 1; x < tx0 + N + 1; x++) {
      if (this.type(x, y) !== T_FORD) continue;
      const X = px(x), Y = py(y);
      ctx.fillStyle = 'rgba(210,190,140,.9)'; ctx.fillRect(X - 1, Y + TS * 0.05, TS + 2, TS * 0.9);
      ctx.fillStyle = '#8a6636'; ctx.fillRect(X - 1, Y + TS * 0.12, TS + 2, TS * 0.76);
      ctx.fillStyle = '#a57c43'; for (let k = 0; k < 4; k++) ctx.fillRect(X - 1, Y + TS * 0.14 + k * TS * 0.19, TS + 2, TS * 0.16);
      ctx.fillStyle = '#5c3f21'; ctx.fillRect(X - 1, Y + TS * 0.08, TS + 2, TS * 0.06); ctx.fillRect(X - 1, Y + TS * 0.86, TS + 2, TS * 0.06);
    }

    // ---- grass tufts and flowers on top of everything that is land
    for (let y = ty0; y < ty0 + N; y++) for (let x = tx0; x < tx0 + N; x++) {
      if (this.type(x, y) !== T_GRASS && this.type(x, y) !== T_DRY) continue;
      const h = hash(x, y, 70);
      if (h > 0.8) {
        const bx = px(x) + hash(x, y, 71) * TS, by = py(y) + hash(x, y, 72) * TS;
        ctx.strokeStyle = h > 0.85 ? 'rgba(176,168,84,.7)' : 'rgba(44,48,14,.55)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - 2, by - 5); ctx.moveTo(bx + 2, by); ctx.lineTo(bx + 3, by - 6); ctx.moveTo(bx + 4, by); ctx.lineTo(bx + 6, by - 4); ctx.stroke();
      }
      if (h < 0.035) {
        const bx = px(x) + hash(x, y, 73) * TS, by = py(y) + hash(x, y, 74) * TS;
        ctx.fillStyle = ['#f0e070', '#f2f2f6', '#e07a8a', '#9ab4ec'][((h * 57) | 0) % 4];
        ctx.beginPath(); ctx.arc(bx, by, 1.8, 0, 7); ctx.fill();
      }
    }
    // ---- ground detail: pebbles, cracked earth, dry scrub and wheel ruts on the open ground
    if (gfx.q >= 1) for (let y = ty0; y < ty0 + N; y++) for (let x = tx0; x < tx0 + N; x++) {
      const t = this.type(x, y); if (t === T_WATER || t === T_FORD || t === T_ROCK || t < 0) continue;
      const h = hash(x, y, 120), bx = px(x) + hash(x, y, 121) * TS, by = py(y) + hash(x, y, 122) * TS;
      if (t === T_SAND || t === T_DRY || t === T_DIRT) {
        if (h < 0.16) { ctx.fillStyle = 'rgba(80,66,44,.55)'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(bx + k * 3 - 3, by + (k & 1) * 2, 1.6 + hash(x, y, 130 + k), 1, 0, 0, 7); ctx.fill(); } }
        else if (h < 0.22 && t !== T_DIRT) { ctx.strokeStyle = 'rgba(96,78,48,.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 5, by + 2); ctx.lineTo(bx + 7, by + 7); ctx.moveTo(bx + 5, by + 2); ctx.lineTo(bx + 11, by + 1); ctx.stroke(); }
        else if (h < 0.27) { ctx.strokeStyle = 'rgba(122,110,52,.75)'; ctx.lineWidth = 1.3; ctx.beginPath(); for (let k = -2; k <= 2; k++) { ctx.moveTo(bx, by); ctx.lineTo(bx + k * 2.4, by - 6 + Math.abs(k)); } ctx.stroke(); }
      } else if (t === T_GRASS && h < 0.1) { ctx.fillStyle = 'rgba(40,52,18,.35)'; ctx.beginPath(); ctx.ellipse(bx, by, 4 + hash(x, y, 125) * 3, 2.2, 0, 0, 7); ctx.fill(); }
    }
    return cv;
  }

  // Blit visible chunks through the isometric transform.
  draw(ctx, r) {
    const dpr = r.dpr;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const [bx0, by0, bx1, by1] = r.viewBounds(1);
    const cx0 = Math.max(0, Math.floor(bx0 / CH)), cy0 = Math.max(0, Math.floor(by0 / CH));
    const cx1 = Math.min(this.cw - 1, Math.floor(bx1 / CH)), cy1 = Math.min(this.ch - 1, Math.floor(by1 / CH));
    const t0 = performance.now();
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      // painting a chunk is the expensive part: spend at most ~22 ms a frame on new ones; the rest appear over the next few frames
      if (!this.chunks.has(cy * this.cw + cx) && performance.now() - t0 > 22 && this.chunks.size > 0) { r.wantMore = true; continue; }
      const c = this.chunk(cx, cy);
      const m = r.isoMatrix(cx * CH - 1, cy * CH - 1, TS);
      ctx.setTransform(m[0] * dpr, m[1] * dpr, m[2] * dpr, m[3] * dpr, m[4] * dpr, m[5] * dpr);
      ctx.drawImage(c, 0, 0);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

// Fog as a soft alpha layer: one pixel per tile, eased over time, blurred up.
// px per tile in the blurred layer: 8 on a small board, fewer on the big one so the blurred canvas stays near 1000 px (2560 px blurred every 0.1 s froze the page)
const FOG_S_MAX = 8;
export class FogLayer {
  constructor(game) {
    this.g = game;
    this.S = Math.max(2, Math.min(FOG_S_MAX, Math.floor(1024 / Math.max(game.W, game.H))));
    this.small = mk(game.W, game.H); this.sctx = this.small.getContext('2d');
    this.big = mk(game.W * this.S, game.H * this.S); this.bctx = this.big.getContext('2d');
    this.img = this.sctx.createImageData(game.W, game.H);
    this.cur = new Float32Array(game.W * game.H).fill(1);
    this.acc = 1; this.canBlur = 'filter' in this.bctx;
    this.last = performance.now();
  }
  update() {
    const g = this.g, now = performance.now(), dt = Math.min(0.5, (now - this.last) / 1000);
    this.acc += dt;
    if (this.acc < 0.1) return;
    const step = Math.min(1, this.acc * 10); this.acc = 0; this.last = now;
    if (this.seenRef !== g.seen[PLAYER] && this.seenRef) { this.cur.fill(1); this.drawn = false; }   // a new valley starts under fog
    this.seenRef = g.seen[PLAYER];
    const seen = g.seen[PLAYER], vis = g.vis[PLAYER], d = this.img.data, cur = this.cur;
    let dirty = false;
    for (let i = 0; i < cur.length; i++) {
      const tgt = !g.fogOn ? 0 : !seen[i] ? 0.55 : vis[i] ? 0 : 0.26;
      const c = cur[i];
      if (c !== tgt) { const n = Math.abs(tgt - c) < 0.02 ? tgt : c + (tgt - c) * step; cur[i] = n; dirty = true; }
      const o = i * 4; d[o] = 18; d[o + 1] = 22; d[o + 2] = 16; d[o + 3] = Math.round(cur[i] * 210);
    }
    if (!dirty && this.drawn) return;
    this.sctx.putImageData(this.img, 0, 0);
    const b = this.bctx;
    b.clearRect(0, 0, this.big.width, this.big.height);
    b.imageSmoothingEnabled = true; b.imageSmoothingQuality = 'high';
    if (this.canBlur) b.filter = `blur(${this.S * 0.9}px)`;
    // draw with a margin of repeated edge so the blur doesn't lighten the map border
    b.drawImage(this.small, 0, 0, this.big.width, this.big.height);
    b.filter = 'none';
    this.drawn = true;
  }
  draw(ctx, r) {
    if (!this.drawn) return;
    const m = r.isoMatrix(0, 0, this.S), dpr = r.dpr;
    ctx.imageSmoothingEnabled = true;
    ctx.setTransform(m[0] * dpr, m[1] * dpr, m[2] * dpr, m[3] * dpr, m[4] * dpr, m[5] * dpr);
    ctx.drawImage(this.big, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
