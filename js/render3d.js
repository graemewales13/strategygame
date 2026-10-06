// Auld World - 3D view (Three.js). Same contract as the 2D Renderer, so the simulation, AI and UI do not know the difference.
// A WebGL canvas sits under the existing #game canvas; #game becomes a transparent overlay for selection boxes, health bars, labels and pings.
// World tile (x, y) maps to three.js (x, height, y). Heights come from terrain type plus smooth noise (hAt); the simulation stays flat.
import * as THREE from '../vendor/three.module.js';
import { PLAYER, HOUSES, T_WATER, T_FORD, T_ROCK, T_SNOW, T_SAND, UNITS, BUILDINGS } from './config.js';
import { Renderer } from './render.js';
import { gfx } from './gfx.js';
import { buildingModel, villageModel, unitModel, treeGeos, propGeos, nodeModel, fixedMaterial, BSCALE } from './models3d.js';

const GROUND = [[84, 128, 62], [134, 104, 60], [40, 100, 128], [146, 108, 64], [154, 140, 76], [200, 180, 120], [108, 104, 100], [228, 234, 240]];
const hash = (x, y) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
const WATER_Y = -0.16;
const FOV = 38;

export class Renderer3D extends Renderer {
  constructor(canvas, game) {
    super(canvas, game);
    this.is3d = true;
    this.yaw = Math.PI / 4; this.pitch = 0.95;
    this.gl = document.createElement('canvas'); this.gl.id = 'gl3d';
    Object.assign(this.gl.style, { position: 'absolute', inset: '0', display: 'block', width: '100%', height: '100%' });
    canvas.parentElement.insertBefore(this.gl, canvas);
    this.R = new THREE.WebGLRenderer({ canvas: this.gl, antialias: true, powerPreference: 'high-performance' });
    this.R.setPixelRatio(this.dpr);
    this.R.shadowMap.enabled = gfx.q >= 1; this.R.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.sky = new THREE.Color('#9fc2d8');
    this.scene.background = this.sky; this.scene.fog = new THREE.Fog('#9fc2d8', 70, 190);
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 400);
    this.hemi = new THREE.HemisphereLight('#dbe8ff', '#6d7a4a', 1.0); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff0d0', 1.7);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 140; this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.objs = new Map();     // key -> { o: Object3D, seen: frame }
    this.frame = 0;
    this.built = null;
    this.matKey = '';
    this.fogCur = null; this.fogAcc = 1;
    this._proj = new THREE.Vector3(); this._ray = new THREE.Raycaster();
    this.gl.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    this.gl.addEventListener('webglcontextrestored', () => { this.lost = false; this.built = null; this.resetWorld(); });
    // keys [ ] turn the view, middle mouse drags it round and tilts it
    window.addEventListener('keydown', (e) => { if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; if (e.key === '[') this.yaw += 0.18; else if (e.key === ']') this.yaw -= 0.18; else if (e.key === '\\') { this.yaw = Math.PI / 4; this.pitch = 0.95; } });
    let drag = null;
    canvas.addEventListener('mousedown', (e) => { if (e.button === 1) { drag = [e.clientX, e.clientY]; e.preventDefault(); } });
    window.addEventListener('mousemove', (e) => { if (!drag) return; this.yaw -= (e.clientX - drag[0]) * 0.007; this.pitch = Math.max(0.55, Math.min(1.35, this.pitch + (e.clientY - drag[1]) * 0.004)); drag = [e.clientX, e.clientY]; });
    window.addEventListener('mouseup', (e) => { if (e.button === 1) drag = null; });
    this.resize();
  }

  // ------------------------------------------------------------------ camera
  resize() {
    super.resize();
    if (!this.R) return;
    this.R.setSize(this.w, this.h, false);
    this.gl.style.width = this.w + 'px'; this.gl.style.height = this.h + 'px';
    this.camera.aspect = this.w / this.h; this.camera.updateProjectionMatrix(); this._ck = '';
  }
  get dist() { return 24 / this.cam.zoom; }
  syncCamera() {
    const c = this.cam, k = `${c.x}|${c.y}|${c.zoom}|${this.yaw}|${this.pitch}|${this.w}|${this.h}`;
    if (k === this._ck) return;
    this._ck = k;
    const ty = this.hAt(c.x, c.y), d = this.dist, cp = Math.cos(this.pitch);
    this.camera.position.set(c.x + Math.sin(this.yaw) * cp * d, ty + Math.sin(this.pitch) * d, c.y + Math.cos(this.yaw) * cp * d);
    this.camera.lookAt(c.x, ty, c.y);
    this.camera.updateMatrixWorld(true); this.camera.updateProjectionMatrix();
  }
  toScreen(x, y, lift = 0) {
    this.syncCamera();
    const v = this._proj.set(x, this.hAt(x, y) + lift, y).project(this.camera);
    return [(v.x * 0.5 + 0.5) * this.w, (-v.y * 0.5 + 0.5) * this.h];
  }
  toWorld(sx, sy) {
    this.syncCamera();
    const nx = (sx / this.w) * 2 - 1, ny = -(sy / this.h) * 2 + 1;
    this._ray.setFromCamera({ x: nx, y: ny }, this.camera);
    const o = this._ray.ray.origin, d = this._ray.ray.direction;
    let h = 0, x = o.x, z = o.z;
    for (let i = 0; i < 4; i++) {
      const t = d.y < -0.02 ? (h - o.y) / d.y : 220;
      x = o.x + d.x * t; z = o.z + d.z * t;
      h = this.hAt(Math.max(0, Math.min(this.game.W, x)), Math.max(0, Math.min(this.game.H, z)));
    }
    return [x, z];
  }
  // pixels that one world tile spans at the middle of the screen (stands in for the 2D zoom when sizing overlays)
  get zEq() { this.syncCamera(); const a = this.toScreen(this.cam.x, this.cam.y), b = this.toScreen(this.cam.x + Math.cos(this.yaw), this.cam.y - Math.sin(this.yaw)); return Math.max(0.3, Math.hypot(b[0] - a[0], b[1] - a[1]) / 48); }
  panScreen(dx, dy) {
    const upp = (2 * this.dist * Math.tan((FOV * Math.PI) / 360)) / this.h * 1.15, s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.cam.x += (c * dx + s * dy) * upp; this.cam.y += (-s * dx + c * dy) * upp; this.clampCam();
  }
  zoomAt(f, sx, sy) {
    const [wx, wy] = this.toWorld(sx, sy);
    this.cam.zoom = Math.max(0.28, Math.min(3.4, this.cam.zoom * f));
    const [wx2, wy2] = this.toWorld(sx, sy);
    this.cam.x += wx - wx2; this.cam.y += wy - wy2; this.clampCam();
  }
  viewPoly() { return [this.toWorld(0, 0), this.toWorld(this.w, 0), this.toWorld(this.w, this.h), this.toWorld(0, this.h)].map(([x, y]) => [Math.max(-4, Math.min(this.game.W + 4, x)), Math.max(-4, Math.min(this.game.H + 4, y))]); }
  viewBounds(margin = 0) {
    const p = this.viewPoly(), g = this.game;
    return [Math.max(0, Math.floor(Math.min(...p.map((q) => q[0])) - margin)), Math.max(0, Math.floor(Math.min(...p.map((q) => q[1])) - margin)), Math.min(g.W, Math.ceil(Math.max(...p.map((q) => q[0])) + margin)), Math.min(g.H, Math.ceil(Math.max(...p.map((q) => q[1])) + margin))];
  }

  // ------------------------------------------------------------------ terrain
  tileH(t) { return t === T_WATER ? -0.62 : t === T_FORD ? -0.2 : t === T_ROCK ? 0.7 : t === T_SNOW ? 0.12 : 0; }
  hAt(x, y) {
    const H = this.H; if (!H) return 0;
    const W = this.game.W, gx = Math.max(0, Math.min(W - 0.001, x)), gy = Math.max(0, Math.min(this.game.H - 0.001, y));
    const ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy, S = W + 1;
    const a = H[iy * S + ix], b = H[iy * S + ix + 1], c = H[(iy + 1) * S + ix], d = H[(iy + 1) * S + ix + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  resetWorld() { this.built = null; this.treeMesh = null; }
  buildWorld() {
    const g = this.game, W = g.W, Hh = g.H, S = W + 1;
    this.disposeWorld();
    const H = new Float32Array(S * (Hh + 1)), col = new Float32Array(S * (Hh + 1) * 3), tt = (x, y) => g.terrain[Math.max(0, Math.min(Hh - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];
    const hills = (x, y) => Math.sin(x * 0.085 + 1.3) * Math.cos(y * 0.07) * 0.33 + Math.sin((x + y) * 0.19) * 0.1 + Math.sin(x * 0.31) * Math.cos(y * 0.27) * 0.05;
    const base = new Float32Array(S * (Hh + 1) * 3);
    const tmp = new THREE.Color();
    for (let y = 0; y <= Hh; y++) for (let x = 0; x <= W; x++) {
      const ts = [tt(x - 1, y - 1), tt(x, y - 1), tt(x - 1, y), tt(x, y)];
      let h = 0, r = 0, gg = 0, b = 0, wet = 0;
      for (const t of ts) { h += this.tileH(t); const c = GROUND[t] || GROUND[0]; r += c[0]; gg += c[1]; b += c[2]; if (t === T_WATER) wet++; }
      h /= 4; r /= 4; gg /= 4; b /= 4;
      if (wet < 4) h += (hills(x, y) * (ts.some((t) => t === T_ROCK) ? 1.8 : 1) + 0.5) * (1 - wet / 4);
      const n = (hash(x, y) - 0.5) * 0.16, hl = Math.max(-0.2, Math.min(0.25, h * 0.25));
      const i = y * S + x; H[i] = h;
      tmp.setRGB(Math.min(1, r / 255 * (1 + n + hl)), Math.min(1, gg / 255 * (1 + n + hl)), Math.min(1, b / 255 * (1 + n + hl)), THREE.SRGBColorSpace);
      base[i * 3] = tmp.r; base[i * 3 + 1] = tmp.g; base[i * 3 + 2] = tmp.b;
    }
    this.H = H; this.baseCol = base;
    // two triangles per tile, shared vertices
    const pos = new Float32Array(S * (Hh + 1) * 3), idx = [];
    for (let y = 0; y <= Hh; y++) for (let x = 0; x <= W; x++) { const i = y * S + x; pos[i * 3] = x; pos[i * 3 + 1] = H[i]; pos[i * 3 + 2] = y; }
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { const a = y * S + x, b = a + 1, c = a + S, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3)); geo.setIndex(idx); geo.computeVertexNormals();
    this.terrainMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })); this.terrainMesh.receiveShadow = true; this.scene.add(this.terrainMesh);
    // water: a lively sheet over the low ground; a dark base beyond the map edge
    const wg = new THREE.PlaneGeometry(W + 40, Hh + 40, Math.ceil((W + 40) / 2), Math.ceil((Hh + 40) / 2)); wg.rotateX(-Math.PI / 2); wg.translate(W / 2, WATER_Y, Hh / 2);
    this.water = new THREE.Mesh(wg, new THREE.MeshPhongMaterial({ color: '#3f8fb4', transparent: true, opacity: 0.8, shininess: 40, specular: '#4a5a66', flatShading: true }));
    this.water.userData.y0 = Float32Array.from(wg.attributes.position.array); this.scene.add(this.water);
    const sk = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2).translate(W / 2, -1.4, Hh / 2), new THREE.MeshBasicMaterial({ color: '#27362a' })); this.scene.add(sk); this.skirt = sk;
    this.fogCur = new Float32Array(W * Hh).fill(1); this.fogAcc = 1;
    // trees and decorations: instanced, rebuilt per map
    this.makeInstanced();
    this.built = { terrain: g.terrain, res: g.resources, n: g.resources.length };
  }
  disposeWorld() {
    for (const m of [this.terrainMesh, this.water, this.skirt, this.treeGroup]) if (m) { this.scene.remove(m); m.traverse?.((o) => { o.geometry?.dispose?.(); }); }
    for (const [, e] of this.objs) this.scene.remove(e.o);
    this.objs.clear(); this.terrainMesh = this.water = this.skirt = this.treeGroup = null;
  }
  makeInstanced() {
    const g = this.game, grp = new THREE.Group(), by = { oak: [], pine: [], palm: [] }, trees = [];
    g.resources.forEach((n, i) => { if (n.kind === 'tree') { const sp = n.v === 'pine' ? 'pine' : n.v === 'palm' ? 'palm' : 'oak'; by[sp].push(i); trees.push(i); } });
    this.treeSets = {};
    const mk = (baked, list, name) => {
      const parts = [baked.f]; const mesh = new THREE.InstancedMesh(baked.f, fixedMaterial, Math.max(1, list.length));
      void parts; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.count = list.length; grp.add(mesh); this.treeSets[name] = { mesh, list };
      return mesh;
    };
    for (const k of ['oak', 'pine', 'palm']) mk(treeGeos[k], by[k], k);
    // scatter: bushes, rocks and grass tufts on open ground
    const W = g.W, Hh = g.H, props = { rock: [], bush: [], tuft: [] };
    for (let y = 1; y < Hh - 1; y++) for (let x = 1; x < W - 1; x++) {
      const t = g.terrain[y * W + x]; if ((t !== 0 && t !== 4) || g.block[y * W + x]) continue;
      const h = hash(x * 7 + 3, y * 13 + 5);
      if (h < 0.011) props[h < 0.0055 ? 'bush' : 'rock'].push([x + hash(x, y + 9), y + hash(x + 9, y), h * 400]);
      else if (h < 0.05) props.tuft.push([x + hash(x, y + 3), y + hash(x + 5, y), h * 100]);
    }
    for (const k of ['rock', 'bush', 'tuft']) {
      const list = props[k], mesh = new THREE.InstancedMesh(propGeos[k].f, fixedMaterial, Math.max(1, list.length)); mesh.count = list.length; mesh.castShadow = k !== 'tuft'; mesh.receiveShadow = true; mesh.frustumCulled = false;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      list.forEach(([x, y, r], i) => { q.setFromEuler(e.set(0, r, 0)); const s = 0.8 + (r % 1) * 0.6; m.compose(new THREE.Vector3(x, this.hAt(x, y), y), q, new THREE.Vector3(s, s, s)); mesh.setMatrixAt(i, m); });
      mesh.instanceMatrix.needsUpdate = true; grp.add(mesh);
    }
    this.scene.add(grp); this.treeGroup = grp; this.treeT = 0;
  }
  updateTrees(isSeen) {
    const g = this.game, m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const k in this.treeSets) {
      const { mesh, list } = this.treeSets[k];
      list.forEach((ri, i) => {
        const n = g.resources[ri];
        if (!n || n.amount <= 0 || n.covered || !isSeen(n.x, n.y)) { mesh.setMatrixAt(i, zero); return; }
        const h = hash(n.x, n.y), x = n.x + 0.5 + (h - 0.5) * 0.3, y = n.y + 0.55, s = 0.85 + h * 0.5, amt = Math.min(1, 0.55 + n.amount / 60);
        q.setFromEuler(e.set(0, h * 6.28, 0)); m.compose(new THREE.Vector3(x, this.hAt(x, y) - 0.02, y), q, new THREE.Vector3(s * amt, s * (0.7 + amt * 0.3), s * amt)); mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  // fog of war: tiles darken as vertex colours, easing between hidden / remembered / in view
  updateFog(dt) {
    const g = this.game, W = g.W, Hh = g.H, seen = g.seen[PLAYER], vis = g.vis[PLAYER], cur = this.fogCur;
    this.fogAcc += dt; if (this.fogAcc < 0.1) return;
    const step = Math.min(1, this.fogAcc * 8); this.fogAcc = 0;
    let dirty = false;
    for (let i = 0; i < cur.length; i++) {
      const tgt = !g.fogOn ? 1 : !seen[i] ? 0.1 : vis[i] ? 1 : 0.58, c = cur[i];
      if (c !== tgt) { cur[i] = Math.abs(tgt - c) < 0.02 ? tgt : c + (tgt - c) * step; dirty = true; }
    }
    if (!dirty && this.fogDrawn) return;
    this.fogDrawn = true;
    const col = this.terrainMesh.geometry.attributes.color, S = W + 1, base = this.baseCol, f = (x, y) => cur[Math.max(0, Math.min(Hh - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];
    for (let y = 0; y <= Hh; y++) for (let x = 0; x <= W; x++) {
      const k = (f(x - 1, y - 1) + f(x, y - 1) + f(x - 1, y) + f(x, y)) / 4, i = (y * S + x) * 3;
      col.array[i] = base[i] * k; col.array[i + 1] = base[i + 1] * k; col.array[i + 2] = base[i + 2] * k;
    }
    col.needsUpdate = true;
  }

  // ------------------------------------------------------------------ pooled objects
  obj(key, make) {
    let e = this.objs.get(key);
    if (!e) { const o = make(); this.scene.add(o); e = { o, seen: 0 }; this.objs.set(key, e); }
    e.seen = this.frame; e.o.visible = true; return e.o;
  }
  sweep() { for (const [k, e] of this.objs) if (e.seen !== this.frame) { this.scene.remove(e.o); this.objs.delete(k); } }
  // screen box of a vertical extent over a ground point
  box2(hits, o, type, x, y, wTiles, hTiles, depthBias = 0) {
    const [sx, sy] = this.toScreen(x, y), [tx, ty] = this.toScreen(x, y, hTiles), [ex] = this.toScreen(x + wTiles * Math.cos(this.yaw), y - wTiles * Math.sin(this.yaw));
    const hw = Math.abs(ex - sx);
    const d = Math.hypot(x - this.camera.position.x, y - this.camera.position.z) + depthBias;
    hits.push({ o, type, x0: sx - hw, y0: Math.min(ty, sy) - 2, x1: sx + hw, y1: sy + 4, d });
  }

  // ------------------------------------------------------------------ frame
  draw(ui) {
    const g = this.game, ctx = this.ctx, dpr = this.dpr, t = performance.now() / 1000;
    if (this.lost) return;
    if (!this.built || this.built.terrain !== g.terrain || this.built.res !== g.resources) this.buildWorld();
    this.frame++;
    const dt = Math.min(0.1, t - (this._t || t)); this._t = t;
    this.syncCamera();
    const seen = g.seen[PLAYER], vis = g.vis[PLAYER];
    const isSeen = (x, y) => !g.fogOn || seen[Math.floor(y) * g.W + Math.floor(x)] === 1;
    const isVis = (x, y) => !g.fogOn || vis[Math.floor(y) * g.W + Math.floor(x)] === 1;
    // light follows the view so shadows stay sharp
    const c = this.cam, ty = this.hAt(c.x, c.y);
    this.sun.position.set(c.x - 22, ty + 36, c.y - 14); this.sun.target.position.set(c.x, ty, c.y); this.sun.target.updateMatrixWorld();
    this.updateFog(dt);
    this.treeT -= dt; if (this.treeT <= 0) { this.updateTrees(isSeen); this.treeT = 0.4; }
    // water motion
    if ((this.frame & 1) === 0) { const p = this.water.geometry.attributes.position, y0 = this.water.userData.y0; for (let i = 0; i < p.count; i++) p.array[i * 3 + 1] = y0[i * 3 + 1] + Math.sin(t * 1.3 + p.array[i * 3] * 0.8 + p.array[i * 3 + 2] * 0.5) * 0.04; p.needsUpdate = true; if ((this.frame & 3) === 0) this.water.geometry.computeVertexNormals(); }

    const hits = []; this.hitsTmp = hits;
    const z = this.zEq;
    // ---- villages
    for (const v of g.villages) {
      if (!isSeen(v.x, v.y)) continue;
      const o = this.obj('v' + v.id + ':' + v.owner + ':' + v.kind, () => villageModel(v.kind, v.owner, v.size));
      const cx = v.tx + v.size / 2, cy = v.ty + v.size / 2, k = v.size / 3;
      o.position.set(cx, this.hAt(cx, cy), cy); o.scale.setScalar(k * 0.95); o.rotation.y = 0;
      this.box2(hits, v, 'village', cx, cy, v.size * 0.7, v.size * 0.8, 1);
    }
    // ---- buildings
    for (const b of g.buildings) {
      if (b.hp <= 0 || (b.team !== PLAYER && !isSeen(b.x, b.y))) continue;
      const o = this.obj('b' + b.id + b.kind + b.team, () => buildingModel(b.kind, b.team));
      const s = b.size, cx = b.tx + s / 2, cy = b.ty + s / 2, k = (s / 3) * (BSCALE[b.kind] || 1) * (b.kind === 'keep' ? 0.92 : 1);
      let hh = -1e9, lo = 1e9; for (const [ox, oy] of [[0, 0], [s, 0], [0, s], [s, s]]) { const h = this.hAt(b.tx + ox, b.ty + oy); hh = Math.max(hh, h); lo = Math.min(lo, h); }
      o.position.set(cx, hh, cy); o.scale.set(k, k * (0.15 + 0.85 * Math.min(1, b.built)), k);
      if (b.built < 1) o.scale.y = k * (0.15 + 0.85 * b.built);
      o.userData.team = b.team;
      const sp = o.userData.spin; if (sp) sp.rotation.z = t * 0.9;
      if (b.flash > 0) o.position.y += Math.sin(t * 60) * 0.02;
      this.box2(hits, b, 'building', cx, cy, s * 0.7, s * 0.65 + 0.3, 1);
    }
    // ---- resource nodes (ore, gold, berries; trees are instanced)
    for (let i = 0; i < g.resources.length; i++) {
      const n = g.resources[i];
      if (n.amount <= 0 || n.covered || !isSeen(n.x, n.y)) continue;
      if (n.kind === 'tree') { if (this.onScreenTile(n.x, n.y)) this.box2(hits, n, 'node', n.x + 0.5, n.y + 0.55, 0.28, 1.1); continue; }
      const o = this.obj('n' + i + n.kind, () => { const grp = new THREE.Group(); const m = new THREE.Mesh(this.nodeGeo(n.kind), fixedMaterial); m.castShadow = true; m.receiveShadow = true; grp.add(m); return grp; });
      o.position.set(n.x + 0.5, this.hAt(n.x + 0.5, n.y + 0.5), n.y + 0.5); o.scale.setScalar(0.9 + hash(n.x, n.y) * 0.3); o.rotation.y = hash(n.y, n.x) * 6;
      this.box2(hits, n, 'node', n.x + 0.5, n.y + 0.5, 0.4, 0.7);
    }
    // ---- units
    for (const u of g.units) {
      if (u.hp <= 0 || u.hidden || u.inside || !(u.team === PLAYER || isVis(u.x, u.y))) continue;
      const o = this.obj('u' + u.id + u.kind + u.team, () => unitModel(u.kind, u.team)), P = o.userData.parts;
      const moving = u.path.length > 0, st = UNITS[u.kind];
      let vx = 0, vy = 0;
      if (u._lx != null && moving && Math.hypot(u.x - u._lx, u.y - u._ly) > 0.003) { vx = u.x - u._lx; vy = u.y - u._ly; }
      else if (!moving) { const k = u.task, tg = k.type === 'gather' ? g.resources[k.nodeId] : (k.type === 'mine' || k.type === 'build' || k.type === 'attack' || k.type === 'infiltrate') ? g.byId.get(k.buildingId ?? k.targetId) : null; if (tg) { vx = tg.x + (tg.size ? 0 : 0.5) - u.x; vy = tg.y + (tg.size ? 0 : 0.5) - u.y; } }
      u._lx = u.x; u._ly = u.y;
      if (vx || vy) { const want = Math.atan2(vx, vy); let d = want - (u._ry ?? want); d = Math.atan2(Math.sin(d), Math.cos(d)); u._ry = (u._ry ?? want) + d * Math.min(1, dt * 12); }
      else if (u._ry == null) u._ry = u.face >= 0 ? Math.PI / 2 : -Math.PI / 2;
      const working = !moving && (u.task.type === 'gather' || u.task.type === 'build' || u.task.type === 'mine');
      const bob = moving ? Math.abs(Math.sin(u.anim * 0.55)) * 0.05 : working ? Math.abs(Math.sin(t * 6 + u.id)) * 0.03 : 0;
      const striking = st.dmg > 0 && u.cooldown > st.cd - 0.3;
      const lunge = striking ? 0.12 * (u.cooldown > st.cd - 0.12 ? 1 : 0.5) : 0;
      o.position.set(u.x + Math.sin(u._ry) * lunge, this.hAt(u.x, u.y) + bob, u.y + Math.cos(u._ry) * lunge); o.rotation.y = u._ry;
      const ph = u.anim * 0.55;
      P.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(ph + (i % 2 ? Math.PI : 0) + (i > 1 && u.kind !== 'camel' ? 0 : 0)) * 0.7 : 0; });
      if (P.arm) P.arm.rotation.x = striking && !P.noSwing ? -1.4 + (u.cooldown / Math.max(0.1, st.cd)) * 1.2 : working ? Math.sin(t * 7 + u.id) * 0.7 - 0.5 : moving && !P.noSwing ? Math.sin(ph) * 0.3 : -0.1;
      if (u.flash > 0) o.position.y += 0.03;
      this.box2(hits, u, 'unit', u.x, u.y, 0.28 * P.scale, 1.0 * P.scale, -0.6);
    }
    for (const u of g.units) u.hidden = false;
    // ---- wandering villagers
    for (const w of g.wanderers || []) {
      if (!isVis(w.x, w.y)) continue;
      for (let i = 0; i < w.n; i++) {
        const o = this.obj('w' + w.id + '_' + i, () => { const m = unitModel('serf', w.team); m.scale.setScalar(0.8); return m; });
        const off = i * 0.45, x = w.x - off * (w.face > 0 ? 1 : -1) * 0.5, y = w.y + off * 0.3;
        o.position.set(x, this.hAt(x, y) + Math.abs(Math.sin(t * 6 + i * 2 + w.id)) * 0.04, y); o.rotation.y = w.face > 0 ? Math.PI / 2 : -Math.PI / 2;
        o.userData.parts.legs.forEach((l, j) => { l.rotation.x = Math.sin(t * 7 + j * Math.PI + i) * 0.6; });
      }
    }
    // ---- projectiles
    g.projectiles.forEach((p, i) => {
      if (!isVis(p.x, p.y)) return;
      const o = this.obj('p' + i, () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 4).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f3e2a0' })); const grp = new THREE.Group(); grp.add(m); return grp; });
      o.position.set(p.x, this.hAt(p.x, p.y) + 0.75 + (p.arc || 0), p.y); o.rotation.y = -(p.ang || 0);
    });
    this.sweep();
    hits.sort((a, b) => b.d - a.d); this.hits = hits;

    this.R.render(this.scene, this.camera);

    // ---- overlay on the 2D canvas
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, this.w, this.h);
    if (ui?.placing) this.territory(ctx, g);
    this.overlay(ctx, ui, isVis, t, z);
    this.effects(ctx, g, t, z, isVis);
    ctx.font = `bold ${Math.round(13 * Math.max(0.8, Math.min(1.4, z)))}px Georgia, serif`; ctx.textAlign = 'center';
    const fcol = { food: '#e58aa3', wood: '#d1a066', gold: '#e2c15e' };
    for (const f of g.floaters) {
      const [sx, sy0] = this.toScreen(f.x, f.y, 1), sy = sy0 - f.age * 24 * Math.min(1.4, z);
      ctx.globalAlpha = Math.max(0, 1 - f.age / 1.3); ctx.fillStyle = '#000'; ctx.fillText(f.text, sx + 1, sy + 1); ctx.fillStyle = fcol[f.res] || '#fff'; ctx.fillText(f.text, sx, sy);
    }
    ctx.globalAlpha = 1;
    this.econOverlay(ctx, ui, t, z);
    if (ui?.placing) this.ghost(ctx, g, ui);
    if (ui?.dragBox) { const b = ui.dragBox; ctx.fillStyle = 'rgba(240,226,160,0.12)'; ctx.strokeStyle = '#f0e2a0'; ctx.lineWidth = 1; ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); ctx.strokeRect(b.x0 + 0.5, b.y0 + 0.5, b.x1 - b.x0, b.y1 - b.y0); }
    if (ui?.pings) for (const p of ui.pings) {
      ctx.strokeStyle = p.color; ctx.globalAlpha = Math.max(0, 1 - p.age / 0.8); ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= 28; i++) { const a = (i / 28) * 6.283, r = 0.4 + p.age * 1.2, [px, py] = this.toScreen(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  onScreenTile(x, y) { const [sx, sy] = this.toScreen(x, y); return sx > -40 && sy > -60 && sx < this.w + 40 && sy < this.h + 40; }
  nodeGeo(kind) { this._ng = this._ng || {}; return (this._ng[kind] = this._ng[kind] || nodeModel(kind).f); }

  // health bars, rank pips, crowns, names, selection rings
  overlay(ctx, ui, isVis, t, z) {
    const g = this.game, zz = Math.max(0.55, Math.min(1.5, z));
    ctx.lineJoin = 'round';
    for (const u of g.units) {
      if (u.hp <= 0 || u.hidden || u.inside || !(u.team === PLAYER || isVis(u.x, u.y))) continue;
      const [sx, sy] = this.toScreen(u.x, u.y);
      if (sx < -40 || sy < -60 || sx > this.w + 40 || sy > this.h + 40) continue;
      const sel = ui?.isSelected(u), sc = (UNITS[u.kind] && u.kind === 'king') ? 1.25 : u.kind === 'knight' ? 1.2 : 1, [, top] = this.toScreen(u.x, u.y, 1.0 * sc + (u.kind === 'knight' ? 0.5 : 0));
      const rad = 0.45;
      ctx.beginPath();
      for (let i = 0; i <= 20; i++) { const a = (i / 20) * 6.283, [px, py] = this.toScreen(u.x + Math.cos(a) * rad, u.y + Math.sin(a) * rad); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      if (sel) { ctx.strokeStyle = '#f0e2a0'; ctx.lineWidth = 2; ctx.stroke(); }
      else if (gfx.q >= 1 && u.kind !== 'camel') { ctx.strokeStyle = HOUSES[u.team]?.primary || '#fff'; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.4; ctx.stroke(); ctx.globalAlpha = 1; }
      if (u.name && (sel || z >= 1.1) && u.team === PLAYER) { ctx.font = `${Math.round(10 * Math.min(1.3, zz))}px Georgia, serif`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,12,4,.85)'; ctx.fillStyle = sel ? '#f6e8b0' : 'rgba(240,226,176,.75)'; ctx.strokeText(u.name.split(' ')[0], sx, sy + 15 * zz); ctx.fillText(u.name.split(' ')[0], sx, sy + 15 * zz); }
      if (u.kind === 'king') this.crownAt(ctx, sx, top - 8 * zz, zz, HOUSES[u.team].accent);
      const bw = Math.max(20, 26 * zz);
      if (u.rank > 0) this.chevrons(ctx, sx + (u.hp < u.maxHp || sel ? bw / 2 + 6 * zz : 0), top - 4, u.rank, zz, u.kind === 'king');
      if (u.hp < u.maxHp || sel) this.bar(ctx, sx - bw / 2, top - 6, bw, 3, u.hp / u.maxHp, this.hpColor(u.hp / u.maxHp));
    }
    for (const b of [...g.buildings, ...g.villages]) {
      const isB = b.type === 'building' || b.kind in BUILDINGS && b.team != null, own = ui?.isSelected(b);
      if (b.hp <= 0 || (b.built != null && b.built < 1 && !own && b.team !== PLAYER)) continue;
      const bx = b.x ?? b.tx + b.size / 2;
      void bx;
      if (own) { this.diamond(ctx, b.tx, b.ty, b.size, b.size); ctx.strokeStyle = '#f0e2a0'; ctx.lineWidth = 2.5; ctx.stroke(); }
      if (b.hp < b.maxHp && (b.built == null || b.built >= 1)) {
        const [sx, sy] = this.toScreen(b.tx + b.size / 2, b.ty + b.size / 2, b.size * 0.8 + 0.4);
        if (sx > -50 && sy > -50 && sx < this.w + 50 && sy < this.h + 50) this.bar(ctx, sx - 22 * zz, sy, 44 * zz, 4, b.hp / b.maxHp, this.hpColor(b.hp / b.maxHp));
      }
      if (b.built != null && b.built < 1) {
        const [sx, sy] = this.toScreen(b.tx + b.size / 2, b.ty + b.size / 2, b.size * 0.8);
        this.bar(ctx, sx - 22 * zz, sy, 44 * zz, 4, b.built, '#d9b44a');
      }
      void isB;
    }
    // ownership: a house-colour footprint on every standing building, so factions read from above
    ctx.globalAlpha = 1;
    for (const b of g.buildings) {
      if (b.hp <= 0 || (b.team !== PLAYER && !isVis(b.x, b.y) && !(g.seen[PLAYER][Math.floor(b.y) * g.W + Math.floor(b.x)]))) continue;
      this.diamond(ctx, b.tx, b.ty, b.size, b.size); ctx.strokeStyle = HOUSES[b.team].primary; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1;
    }
  }

  // placement: the 2D ghost minus its flat sprite (sized for the 2D zoom); the footprint, ring and notes carry over
  ghost(ctx, g, ui) {
    const orig = ctx.drawImage; ctx.drawImage = () => {};
    try { super.ghost(ctx, g, ui); } finally { ctx.drawImage = orig; }
  }
}
