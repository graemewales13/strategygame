// Auld World - HUD, input, menu and campaign map. Talks to the host ONLY through host.send(intent).
import { writeSave, readSave, saveInfo, ago } from './save.js';
import { camelSprite, FIMG, SIMG } from './art.js';
import {
  TILE, PLAYER, HOUSES, UNITS, BUILDINGS, BUILD_ORDER_UI, RES, RES_LABEL, NODE_RES, VILLAGE_KINDS, VILLAGE_WIN_SHARE,
  VILLAGE_WIN_HOLD, WEALTH_HOLD, LAND_LOYALTY, BUILDERS, MIN_HOUSES, MAX_HOUSES, RELATIONS, MATS, MINEABLE, CAMEL_CAP, ROUTE_STOPS, DISTRICT, LINKS, SPY_FEE, DRAFT, WAGE_FREE, INCOME_SOURCES, TAX, SHELF_CAP, MARKET_RADIUS, ALL_GOODS, GOOD_LABEL, GOOD_COLOR, GOOD_INFO, RES_VALUE, MINE_MAX_WORKERS, SCIENCE, ARMS_STEEL, SCI_SILVER, SMELT, GARRISON, DRILL, TRAITS, ABILITIES, LEVY, VILLAGE_GARRISON, POP_HOUSING, SETTLE_FOOD,
} from './config.js';
import { drawCrest, drawVale } from './render.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ART_B = new Set(['keep','cottage','farm','mill','warehouse','market','forge','workshop','tavern','academy','temple','barracks','archery','stable','tower','mine','foundry']);
const ART_U = new Set(['recruit','serf','scout','footman','bowman','knight','spy','scholar']);
const artUrl = (kind, team = PLAYER) => kind === 'village' ? 'assets/shared/villages/1tile/hamlet.png' : FIMG[HOUSES[team].faction]?.[kind] ? FIMG[HOUSES[team].faction][kind].src : kind === 'camel' ? (SIMG.dromedary?.src || camelURL()) : ART_U.has(kind) ? `assets/ui/units/${kind}.png` : ART_B.has(kind) ? `assets/ui/buildings/${kind}.png` : null;
let _camel = null;
function camelURL() { try { return (_camel ||= camelSprite(0).toDataURL()); } catch { return null; } }
const icon = (kind, fallback) => { const u = artUrl(kind); return u ? `<img src="${u}" alt="" draggable="false">` : fallback; };
const portrait = (kind, accent, team = PLAYER) => artUrl(kind, team) ? `<img class="portrait" src="${artUrl(kind, team)}" alt="" draggable="false" style="border-color:${accent}">` : '';
const GLYPH = {
  cottage: '⌂', farm: '≋', mill: '✢', warehouse: '▣', market: '⚖', barracks: '⚔', archery: '➶', stable: '♞', tower: '♜',
  mine: '⛏', foundry: '♨', forge: '⚒', workshop: '⚙', tavern: '⚱', academy: '✎', temple: '✝', keep: '♚',
  recruit: '☗', serf: '♙', scout: '➤', footman: '♖', bowman: '➶', knight: '♞', spy: '◒', camel: '🐪', scholar: '✎', ram: 'Ram',
};
const costText = (cost, p) => ALL_GOODS.filter((r) => cost[r]).map((r) => `<span class="${p && (p[r] || 0) < cost[r] ? 'need' : ''}">${cost[r]} ${GOOD_LABEL[r].toLowerCase()}</span>`).join(' · ') || 'free';
const SHORT = { food: 'g', wood: 't', gold: 'c', stone: 's' };
const costShort = (cost) => Object.entries(cost).filter(([, v]) => v).map(([k, v]) => `${v}${SHORT[k] || k[0]}`).join(' ');
const dot = (g) => `<i class="gd" style="background:${GOOD_COLOR[g]}"></i>`;

export class UI {
  constructor({ game, host, renderer, minimap, cfg }) {
    this.game = game; this.host = host; this.r = renderer; this.mini = minimap; this.cfg = cfg;
    this.sel = { type: 'none', ids: [], id: null };
    this.groups = {};
    this.placing = null; this.hoverTX = 0; this.hoverTY = 0;
    this.dragBox = null; this.drag = null; this.pings = [];
    this.keys = new Set(); this.mouse = { x: 0, y: 0, in: false };
    this.speed = 1; this.paused = false; this.started = false;
    this.menuOpen = true; this.campaignOpen = false; this.endShown = false;
    this.lastClick = { t: 0, id: null };
    this.want = null; this.hudT = 0; this.sigCmd = ''; this.sigSel = ''; this.tradeIdx = 0;
    this.toastSeen = 0;
    const off = document.createElement('div'); off.id = 'offers'; $('field').appendChild(off);
    off.addEventListener('click', (e) => { const b = e.target.closest('button[data-act]'); if (b) this.onCmd({ ...b.dataset }); });
    this.bind();
    this.buildMenu();
  }
  setGame(game) { this.game = game; this.mini.setGame(game); this.clearSel(); this.placing = null; this.endShown = false; this.sigCmd = this.sigSel = ''; $('end').classList.add('hidden'); }

  // ------------------------------------------------------------ selection helpers
  isSelected(e) {
    const s = this.sel;
    if (e.type === 'unit') return s.type === 'units' && s.ids.includes(e.id);
    return (s.type === 'building' || s.type === 'village') && s.id === e.id;
  }
  clearSel() { this.sel = { type: 'none', ids: [], id: null }; }
  selUnits() { return this.sel.type === 'units' ? this.sel.ids.map((id) => this.game.byId.get(id)).filter((u) => u && u.hp > 0) : []; }
  selEntity() { return ['building', 'village'].includes(this.sel.type) ? this.game.byId.get(this.sel.id) : null; }
  setUnits(units) {
    if (!units.length) return this.clearSel();
    this.sel = { type: 'units', ids: units.map((u) => u.id), id: null };
  }
  pruneSel() {
    const g = this.game;
    if (this.sel.type === 'units') { const alive = this.sel.ids.filter((id) => { const u = g.byId.get(id); return u && u.hp > 0; }); if (alive.length !== this.sel.ids.length) this.sel.ids = alive; if (!alive.length) this.clearSel(); }
    else if (this.sel.type === 'building' || this.sel.type === 'village') { const e = g.byId.get(this.sel.id); if (!e || e.hp <= 0 && e.type !== 'village') this.clearSel(); }
    else if (this.sel.type === 'node') { const n = g.resources[this.sel.id]; if (!n || n.amount <= 0) this.clearSel(); }
  }

  // ------------------------------------------------------------ DOM events
  bind() {
    const cv = $('game');
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('mousedown', (e) => this.onDown(e));
    window.addEventListener('mousemove', (e) => this.onMove(e));
    window.addEventListener('mouseup', (e) => this.onUp(e));
    cv.addEventListener('mouseleave', () => { this.mouse.in = false; });
    cv.addEventListener('mouseenter', () => { this.mouse.in = true; });
    cv.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('resize', () => { this.r.resize(); this.r.clampCam(); });

    const mm = $('minimap');
    mm.addEventListener('contextmenu', (e) => e.preventDefault());
    const mmPos = (e) => { const b = mm.getBoundingClientRect(); return [((e.clientX - b.left) / b.width) * this.game.W, ((e.clientY - b.top) / b.height) * this.game.H]; };
    mm.addEventListener('mousedown', (e) => {
      const [x, y] = mmPos(e);
      if (e.button === 2) { this.command(x, y); return; }
      this.r.centerOn(x, y); this.mmDrag = true;
    });
    window.addEventListener('mousemove', (e) => { if (this.mmDrag) { const [x, y] = mmPos(e); this.r.centerOn(Math.max(0, Math.min(this.game.W, x)), Math.max(0, Math.min(this.game.H, y))); } });
    window.addEventListener('mouseup', () => { this.mmDrag = false; });

    $('btnMenu').onclick = () => this.openMenu();
    $('btnMap').onclick = () => this.toggleCampaign();
    $('btnHome').onclick = () => this.focusHall();
    $('btnIdle').onclick = () => this.selectIdleSerf();
    $('btnArmy').onclick = () => this.selectArmy();
    $('btnSpeed').onclick = () => { this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1; $('btnSpeed').textContent = this.speed + 'x'; };
    $('eNew').onclick = () => this.newValley();
    $('eStay').onclick = () => $('end').classList.add('hidden');

    const cmd = $('cmdPanel');
    cmd.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) this.onCmd(b.dataset); });
    $('selPanel').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) this.onCmd(b.dataset); });
    $('houses').addEventListener('click', (e) => { const b = e.target.closest('[data-house]'); if (b) this.toggleDiplo(+b.dataset.house); });
    $('diplo').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) this.onCmd({ ...b.dataset }); });

    // tooltips
    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest('[data-tip]'); const tip = $('tip');
      if (!el) { tip.classList.add('hidden'); return; }
      tip.innerHTML = decodeURIComponent(el.dataset.tip); tip.classList.remove('hidden'); this.placeTip(e);
    });
    document.addEventListener('mousemove', (e) => { if (!$('tip').classList.contains('hidden')) this.placeTip(e); });

    // campaign map
    const cc = $('campaignCanvas');
    const cpos = (e) => { const b = cc.getBoundingClientRect(); return [((e.clientX - b.left) / b.width) * this.game.W, ((e.clientY - b.top) / b.height) * this.game.H]; };
    cc.addEventListener('click', (e) => { const [x, y] = cpos(e); this.r.centerOn(x, y); this.closeCampaign(); });
    cc.addEventListener('mousemove', (e) => {
      const [x, y] = cpos(e), g = this.game, tip = $('cTip');
      const v = g.villages.find((v) => x >= v.tx - 1 && x < v.tx + v.size + 1 && y >= v.ty - 1 && y < v.ty + v.size + 1 && g.wasSeen(PLAYER, v.x, v.y));
      if (!v) { tip.classList.add('hidden'); return; }
      const b = cc.getBoundingClientRect(), pb = cc.parentElement.getBoundingClientRect();
      tip.innerHTML = `<b>${esc(v.name)}</b> · ${VILLAGE_KINDS[v.kind].label}<br>${v.owner >= 0 ? esc(HOUSES[v.owner].name) : 'Independent'} · loyalty ${v.loyalty | 0} · protection ${v.protection | 0}`;
      tip.style.left = Math.min(e.clientX - pb.left + 14, pb.width - 260) + 'px'; tip.style.top = e.clientY - pb.top + 14 + 'px'; tip.classList.remove('hidden');
    });
  }
  placeTip(e) { const tip = $('tip'); const w = tip.offsetWidth, h = tip.offsetHeight; tip.style.left = Math.min(window.innerWidth - w - 8, e.clientX + 14) + 'px'; tip.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, e.clientY - h - 12)) + 'px'; }

  canvasPos(e) { const b = $('game').getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
  worldPos(e) { const [sx, sy] = this.canvasPos(e); return this.r.toWorld(sx, sy); }

  onDown(e) {
    if (this.menuOpen || this.campaignOpen) return;
    const [sx, sy] = this.canvasPos(e), [wx, wy] = this.r.toWorld(sx, sy);
    if (e.button === 2) {
      if (this.placing) { this.placing = null; $('game').classList.remove('placing'); return; }
      this.command(sx, sy, wx, wy, e.shiftKey); return;
    }
    if (e.button !== 0) return;
    if (this.placing) { this.tryPlace(e.shiftKey); return; }
    this.drag = { sx, sy, shift: e.shiftKey };
  }
  onMove(e) {
    const [sx, sy] = this.canvasPos(e);
    this.mouse.x = sx; this.mouse.y = sy;
    const [wx, wy] = this.r.toWorld(sx, sy);
    if (this.placing) {
      const s = BUILDINGS[this.placing].size; this.hoverTX = Math.round(wx - s / 2); this.hoverTY = Math.round(wy - s / 2);
      if (this.placing === 'mine') { const n = this.game.nodeAt(wx, wy); const sp = n && MINEABLE.includes(n.kind) ? this.game.mineSpot(PLAYER, n) : null; if (sp) { this.hoverTX = sp[0]; this.hoverTY = sp[1]; } }
    }
    if (this.drag) {
      if (Math.hypot(sx - this.drag.sx, sy - this.drag.sy) > 6) this.dragBox = { x0: Math.min(sx, this.drag.sx), y0: Math.min(sy, this.drag.sy), x1: Math.max(sx, this.drag.sx), y1: Math.max(sy, this.drag.sy) };
    }
  }
  onUp(e) {
    if (e.button !== 0 || !this.drag) return;
    const d = this.drag; this.drag = null;
    const box = this.dragBox; this.dragBox = null;
    if (this.menuOpen || this.campaignOpen) return;
    const g = this.game, r = this.r;
    if (box) {
      const inBox = (o, lift) => { const [px, py] = r.toScreen(o.x, o.y); return px >= box.x0 && px <= box.x1 && py - lift >= box.y0 && py - lift <= box.y1; };
      const mine = g.units.filter((u) => u.team === PLAYER && u.hp > 0 && !u.inside && inBox(u, 14 * r.cam.zoom));
      if (mine.length) {
        if (d.shift && this.sel.type === 'units') { const set = new Map(this.selUnits().map((u) => [u.id, u])); mine.forEach((u) => set.set(u.id, u)); this.setUnits([...set.values()]); }
        else this.setUnits(mine);
      } else {
        const b = g.buildings.find((b) => b.team === PLAYER && b.hp > 0 && inBox(b, 0));
        if (b) this.sel = { type: 'building', ids: [], id: b.id };
      }
      return;
    }
    this.clickAt(d.sx, d.sy, d.shift);
  }
  clickAt(sx, sy, shift) {
    const g = this.game, r = this.r, h = r.pick(sx, sy, ['unit']) || r.pick(sx, sy);   // a person under the cursor wins over the building or village behind them
    if (h && h.type === 'unit') {
      const u = h.o, now = performance.now();
      if (u.team === PLAYER) {
        if (this.lastClick.id === u.id && now - this.lastClick.t < 350) {
          this.setUnits(g.units.filter((o) => o.team === PLAYER && o.kind === u.kind && o.hp > 0 && r.onScreen(o.x, o.y)));
        } else if (shift && this.sel.type === 'units') {
          const set = this.selUnits(); const i = set.findIndex((o) => o.id === u.id); if (i >= 0) set.splice(i, 1); else set.push(u); this.setUnits(set);
        } else this.setUnits([u]);
        this.lastClick = { t: now, id: u.id };
      } else this.sel = { type: 'units', ids: [u.id], id: null };
      return;
    }
    if (h && h.type === 'building' && h.o.kind === 'market' && this.sel.type === 'units') {
      const sel = this.selUnits(), camels = sel.filter((u) => u.kind === 'camel');
      if (camels.length && camels.length === sel.length) {   // camels selected: clicking a market adds it to their loop
        if (!this.host.send({ type: 'route', ids: camels.map((u) => u.id), targetId: h.o.id })) this.toast(g.diploNote || 'Cannot add that market.', 'warn');
        return;
      }
    }
    if (h && h.type === 'building') { this.sel = { type: 'building', ids: [], id: h.o.id }; return; }
    if (h && h.type === 'village') { this.sel = { type: 'village', ids: [], id: h.o.id }; return; }
    if (h && h.type === 'node') { this.sel = { type: 'node', ids: [], id: h.o.id }; return; }
    if (!shift) this.clearSel();
  }
  command(sx, sy, wx, wy, shift = false) {
    const g = this.game, units = this.selUnits().filter((u) => u.team === PLAYER);
    const h = this.r.pick(sx, sy), ho = h ? h.o : null;
    const eu = h && h.type === 'unit' ? ho : null, v = h && h.type === 'village' ? ho : null, b = h && h.type === 'building' ? ho : null, n = h && h.type === 'node' ? ho : null;
    if (ho) { wx = ho.x + (ho.type === 'node' ? 0.5 : 0); wy = ho.y + (ho.type === 'node' ? 0.5 : 0); } // act on the thing itself, not the ground behind its sprite
    let color = '#8fe08f';
    if ((eu && eu.team !== PLAYER) || (v && v.owner !== PLAYER) || (b && b.team !== PLAYER)) color = '#e0685a';
    else if (n) color = '#e2c15e';
    if (units.length) {
      this.host.send({ type: 'context', ids: units.map((u) => u.id), x: wx, y: wy, queue: shift, want: this.want });
      this.pings.push({ x: wx, y: wy, age: 0, color });
      return;
    }
    const sb = this.selEntity();
    if (sb && sb.type === 'building' && sb.team === PLAYER && sb.kind === 'keep' && v && v.owner === PLAYER) {
      if (this.host.send({ type: 'levy', buildingId: sb.id, villageId: v.id })) this.pings.push({ x: v.x, y: v.y, age: 0, color: '#8fe08f' });
      return;
    }
    if (sb && sb.type === 'building' && sb.team === PLAYER && Object.values(UNITS).some((s) => s.from.includes(sb.kind))) {
      this.host.send({ type: 'rally', buildingId: sb.id, x: wx, y: wy, nodeId: n ? n.id : null });
      this.pings.push({ x: wx, y: wy, age: 0, color: '#7ac1ff' });
      this.toast(n ? 'Rally point set on the resource: new serfs will gather.' : 'Rally point set.', 'info');
    }
  }
  tryPlace(keep) {
    const serfs = this.selUnits().filter((u) => BUILDERS[u.kind]).map((u) => u.id);
    const nd = this.placing === 'mine' ? this.game.depositsUnder(this.hoverTX, this.hoverTY, BUILDINGS.mine.size)[0] : null;
    const res = this.host.send({ type: 'place', kind: this.placing, tx: this.hoverTX, ty: this.hoverTY, ids: serfs, nodeId: nd ? nd.id : null });
    if (res) { if (!keep) { this.placing = null; $('game').classList.remove('placing'); } }
  }
  onWheel(e) {
    if (this.menuOpen || this.campaignOpen) return;
    e.preventDefault();
    const [sx, sy] = this.canvasPos(e);
    this.r.zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, sx, sy);
  }

  onKey(e) {
    const k = e.key.toLowerCase();
    const tg = e.target;
    if (tg && (tg.tagName === 'TEXTAREA' || (tg.tagName === 'INPUT' && tg.type !== 'checkbox'))) { if (k === 'enter' || k === 'escape') tg.blur?.(); if (k !== 'escape') return; }
    if (k === 'escape') return this.onEsc();
    if (k === 'f5') { e.preventDefault(); return void this.saveGame('manual'); }
    if (k === 'f9') { e.preventDefault(); return void this.loadGame('manual'); }
    if (this.menuOpen) { if (k === 'enter' && this.started) this.closeMenu(); return; }
    if (k === 't') { this.showStand = !this.showStand; $('standings').classList.toggle('hidden', !this.showStand); return; }
    if (k === 'm' || k === 'tab') { e.preventDefault(); return this.toggleCampaign(); }
    if (this.campaignOpen) return;
    this.keys.add(k);
    if (e.repeat) return;
    if (k === 'h') this.focusHall();
    else if (k === 'p') this.setPaused(!this.paused);
    else if (k === '.') this.selectIdleSerf();
    else if (k === ',') this.selectArmy();
    else if (k === '+' || k === '=') { this.speed = Math.min(4, this.speed * 2); $('btnSpeed').textContent = this.speed + 'x'; }
    else if (k === '-') { this.speed = Math.max(1, this.speed / 2); $('btnSpeed').textContent = this.speed + 'x'; }
    else if (/^[1-9]$/.test(k)) {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); const us = this.selUnits(); if (us.length) { this.groups[k] = us.map((u) => u.id); this.toast(`Group ${k} set (${us.length}).`, 'info'); } }
      else if (this.groups[k]) { const us = this.groups[k].map((id) => this.game.byId.get(id)).filter((u) => u && u.hp > 0); if (us.length) { this.setUnits(us); if (this.lastGroup === k) this.r.centerOn(us[0].x, us[0].y); this.lastGroup = k; } }
    } else if (k === 's' && this.selUnits().length && !e.ctrlKey) { /* WASD pans; stop is a button */ }
  }
  onEsc() {
    if (this.placing) { this.placing = null; $('game').classList.remove('placing'); return; }
    if (this.campaignOpen) return this.closeCampaign();
    if (this.menuOpen) { if (this.started) this.closeMenu(); return; }
    if (this.sel.type !== 'none' && false) return this.clearSel();
    this.openMenu();
  }
  setPaused(p) { this.paused = p; $('pausedBanner').classList.toggle('hidden', !p); }

  focusHall() { const s = this.game.seatOf(PLAYER); if (!s) return; this.r.centerOn(s.x, s.y); this.sel = { type: s.type === 'village' ? 'village' : 'building', ids: [], id: s.id }; }
  selectIdleSerf() {
    const idle = this.game.units.filter((u) => u.team === PLAYER && u.kind === 'serf' && u.hp > 0 && !u.inside && u.task.type === 'idle');
    if (!idle.length) return this.toast('No idle serfs.', 'info');
    this.idleI = ((this.idleI ?? -1) + 1) % idle.length;
    const u = idle[this.idleI]; this.setUnits([u]); this.r.centerOn(u.x, u.y);
  }
  selectArmy() {
    const army = this.game.militaryOf(PLAYER);
    if (!army.length) return this.toast('You have no soldiers yet.', 'info');
    this.setUnits(army);
  }

  // ------------------------------------------------------------ commands from buttons
  onCmd(d) {
    const g = this.game;
    switch (d.act) {
      case 'place': {
        const chk = g.canPlace(PLAYER, d.kind, -999, -999);
        const s = BUILDINGS[d.kind];
        const miss = s.requires.find((r) => !g.hasBuilding(PLAYER, r));
        if (miss) return this.toast(`${s.label} needs a ${BUILDINGS[miss].label}.`, 'warn');
        if (!g.canAfford(PLAYER, s.cost)) return this.toast('Not enough goods.', 'warn');
        this.placing = d.kind; $('game').classList.add('placing');
        const [wx, wy] = this.r.toWorld(this.mouse.x, this.mouse.y); this.hoverTX = Math.round(wx - s.size / 2); this.hoverTY = Math.round(wy - s.size / 2);
        break;
      }
      case 'train': { const b = this.selEntity(); if (b) this.host.send({ type: 'train', buildingId: b.id, kind: d.kind }); break; }
      case 'cancel': { const b = this.selEntity(); if (b) this.host.send({ type: 'cancel', buildingId: b.id, index: +d.i }); break; }
      case 'stop': this.host.send({ type: 'stop', ids: this.selUnits().map((u) => u.id) }); break;
      case 'kind': this.setUnits(this.selUnits().filter((u) => u.kind === d.kind)); break;
      case 'load': { const u = this.selUnits().find((x) => x.kind === 'camel'); if (u) this.host.send({ type: 'load', unitId: u.id, good: d.good, amount: 20 }); break; }
      case 'unload': { const u = this.selUnits().find((x) => x.kind === 'camel'); if (u) this.host.send({ type: 'unload', unitId: u.id }); break; }
      case 'want': this.want = this.want === d.good ? null : d.good; break;
      case 'spy': { const ids = this.selUnits().filter((u) => u.kind === 'recruit').map((u) => u.id); if (ids.length && !this.host.send({ type: 'role', ids, role: 'spy' })) this.toast(`A spy costs ${SPY_FEE} coin.`, 'warn'); break; }
      case 'selroute': {
        const t = this.selEntity(); if (!t) break;
        const camels = g.units.filter((u) => u.team === PLAYER && u.kind === 'camel' && u.hp > 0 && u.route?.targetId !== t.id);
        camels.sort((a, c) => (a.route ? 1 : 0) - (c.route ? 1 : 0) || Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(c.x - t.x, c.y - t.y));
        if (camels[0]) this.host.send({ type: 'route', ids: [camels[0].id], targetId: t.id, want: this.want || 'gold' });
        break;
      }
      case 'serfjob': {
        const all = this.selUnits().filter((u) => u.kind === 'serf'), serfs = d.id ? all.filter((u) => u.id === +d.id) : all;
        if (!serfs.length) break;
        if (d.job === 'home') {
          const homes = g.villages.filter((v) => v.owner === PLAYER);
          let sent = 0;
          for (const u of serfs) { const v = homes.slice().sort((a, c) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(c.x - u.x, c.y - u.y))[0]; if (v && this.host.send({ type: 'enter', ids: [u.id], targetId: v.id })) sent++; }
          if (!sent) this.toast('No village of yours to go home to.', 'warn');
          break;
        }
        const kind = d.job === 'wood' ? 'tree' : 'berry';
        let sent = 0;
        for (const u of serfs) {
          const n = g.resources.filter((r) => r.kind === kind && r.amount > 0 && g.ruled(PLAYER, r.x + 0.5, r.y + 0.5)).sort((a, c) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(c.x - u.x, c.y - u.y))[0];
          if (n && this.host.send({ type: 'gather', ids: [u.id], nodeId: n.id })) sent++;
        }
        if (!sent) this.toast(kind === 'tree' ? 'No timber on your ground within reach. Raise a market or keep near trees.' : 'No berries on your ground within reach.', 'warn');
        break;
      }
      case 'routecamel': {
        const t = this.selEntity(), u = g.byId.get(+d.id); if (!t || !u || u.kind !== 'camel') break;
        if (!this.host.send({ type: 'route', ids: [u.id], targetId: t.id })) this.toast(g.diploNote || 'That camel cannot take that road.', 'warn');
        break;
      }
      case 'routestop': {
        const ids = this.selUnits().filter((x) => x.kind === 'camel').map((x) => x.id);
        if (ids.length) this.host.send({ type: 'route', ids, targetId: +d.market });
        break;
      }
      case 'stopgo': {
        const sel = this.selUnits().filter((u) => u.kind === 'camel' && u.route), t = this.selEntity();
        const ids = sel.length ? sel.map((u) => u.id) : g.units.filter((u) => u.team === PLAYER && u.route && t && u.route.targetId === t.id).map((u) => u.id);
        if (ids.length) this.host.send({ type: 'stoproute', ids });
        break;
      }
      case 'sell': { const m = this.selEntity(); if (m && m.kind === 'market') this.host.send({ type: 'sell', marketId: m.id, good: d.good, amount: 20 }); break; }
      case 'draft': { const v = this.selEntity(); if (v) this.host.send({ type: 'draft', villageId: v.id, role: d.role, n: +d.n }); break; }
      case 'settle': { const v = this.selEntity(); if (v) this.host.send({ type: 'settle', villageId: v.id }); break; }
      case 'sendspy': case 'sendarmy': case 'sendcamel': case 'entervillage': {
        const v = this.selEntity(); if (!v) break;
        const mine = g.units.filter((u) => u.team === PLAYER && u.hp > 0 && !u.inside);
        const near = (a, c) => Math.hypot(a.x - v.x, a.y - v.y) - Math.hypot(c.x - v.x, c.y - v.y);
        if (d.act === 'sendspy') { const sp = mine.filter((u) => u.kind === 'spy').sort(near)[0]; if (sp) this.host.send({ type: 'infiltrate', ids: [sp.id], villageId: v.id }); }
        else if (d.act === 'sendarmy') { const a = g.militaryOf(PLAYER).map((u) => u.id); if (a.length) this.host.send({ type: 'attack', ids: a, targetId: v.id }); }
        else if (d.act === 'entervillage') { const a = g.militaryOf(PLAYER).filter((u) => u.task.type === 'idle').map((u) => u.id); if (a.length) this.host.send({ type: 'enter', ids: a, targetId: v.id }); }
        else { const c = mine.filter((u) => u.kind === 'camel' && u.task.type !== 'caravan').sort(near)[0]; if (c) this.host.send({ type: 'context', ids: [c.id], x: v.x, y: v.y, want: this.want }); }
        break;
      }
      case 'keephere': { const v = this.selEntity(); if (!v) break; if (!g.canAfford(PLAYER, BUILDINGS.keep.cost)) return this.toast('Not enough goods for a keep.', 'warn'); this.placing = 'keep'; $('game').classList.add('placing'); this.hoverTX = Math.round(v.x) - 8; this.hoverTY = Math.round(v.y) - 2; break; }
      case 'sendarmyb': { const b = this.selEntity(); const a = g.militaryOf(PLAYER).map((u) => u.id); if (b && a.length) this.host.send({ type: 'attack', ids: a, targetId: b.id }); break; }
      case 'minehere': { const n = this.sel.type === 'node' ? g.resources[this.sel.id] : null; if (n) { this.placing = 'mine'; $('game').classList.add('placing'); this.hoverTX = Math.round(n.x - 1); this.hoverTY = Math.round(n.y - 1); } break; }
      case 'gathernode': { const n = this.sel.type === 'node' ? g.resources[this.sel.id] : null; if (!n) break; const serfs = g.units.filter((u) => u.team === PLAYER && u.kind === 'serf' && u.hp > 0 && u.task.type === 'idle').sort((a, c) => Math.hypot(a.x - n.x, a.y - n.y) - Math.hypot(c.x - n.x, c.y - n.y)).slice(0, 4); if (!serfs.length) this.toast('No idle serfs.', 'warn'); else this.host.send({ type: 'gather', ids: serfs.map((u) => u.id), nodeId: n.id }); break; }
      case 'treaty': this.treaty(+d.team, d.state); break;
      case 'diploclose': this.diploOpen = null; this.renderDiplo(); break;
      case 'respond': this.host.send({ type: 'respond', from: +d.team, accept: d.accept === '1' }); break;
      case 'mineidle': {
        const b = this.selEntity(); if (!b) break;
        const free = MINE_MAX_WORKERS - g.minersOf(b);
        const serfs = g.units.filter((u) => u.team === PLAYER && u.kind === 'serf' && u.hp > 0 && u.task.type !== 'mine' && u.task.type !== 'build').sort((a, c) => (a.task.type === 'idle' ? 0 : 1) - (c.task.type === 'idle' ? 0 : 1) || Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y)).slice(0, free);
        if (!serfs.length) { this.toast(free ? 'No serfs free to send.' : 'The mine is fully staffed.', 'warn'); break; }
        this.host.send({ type: 'mine', ids: serfs.map((u) => u.id), buildingId: b.id });
        break;
      }
      case 'hire': { const b = this.selEntity(); if (b) this.host.send({ type: 'hire', buildingId: b.id, index: +d.i }); break; }
      case 'leave': { const b = this.selEntity(); if (b) this.host.send({ type: 'leave', buildingId: b.id }); break; }
      case 'gsel': this.gsel = +d.id; break;
      case 'drill': {
        const b = this.selEntity(); if (!b) break;
        let u = this.gsel != null ? g.byId.get(this.gsel) : null;
        if (!u || u.inside !== b.id || u.drilling || (u.kind !== 'recruit' && u.kind !== 'serf')) u = b.garrison.map((id) => g.byId.get(id)).find((x) => x && !x.drilling && (x.kind === 'recruit' || x.kind === 'serf'));
        if (!u) { this.toast('No recruit or serf inside to drill. Right-click the keep with them.', 'warn'); break; }
        this.host.send({ type: 'drill', buildingId: b.id, unitId: u.id, kind: d.kind });
        break;
      }
      case 'unmine': { const b = this.selEntity(); if (b) this.host.send({ type: 'unmine', buildingId: b.id }); break; }
      case 'select': { const e = g.byId.get(+d.id); if (e) this.sel = e.type === 'unit' ? { type: 'units', ids: [e.id], id: null } : { type: e.type, ids: [], id: e.id }; break; }
      default: break;
    }
    this.sigCmd = this.sigSel = '';
  }
  // One treaty request, with the reason shown whenever it is refused
  treaty(team, state) {
    const g = this.game, name = HOUSES[team].name;
    const r = this.host.send({ type: 'relation', other: team, state });
    if (r === 'pending') this.toast(`Offer sent to ${name}.`, 'info');
    else if (r) this.toast(state === 'war' ? `War on ${name}!` : state === 'trade' ? `Trade treaty with ${name}.` : `Peace with ${name}.`, state === 'war' ? 'war' : 'good');
    else this.toast(g.diploNote || `${name} refuses.`, 'warn');
    this.sigDiplo = ''; this.renderDiplo();
  }
  toggleDiplo(team) { if (team === PLAYER) return; this.diploOpen = this.diploOpen === team ? null : team; this.sigDiplo = ''; this.renderDiplo(); }
  // the diplomacy panel under a house's chip: where you stand, and the three explicit choices
  renderDiplo() {
    const el = $('diplo'), g = this.game, t = this.diploOpen;
    if (t == null || !g.alive(t)) { this.diploOpen = null; if (!el.classList.contains('hidden')) el.classList.add('hidden'); return; }
    const rel = g.rel[PLAYER][t], known = g.known[PLAYER][t], wait = Math.ceil(g.parleyIn(PLAYER, t));
    const pend = g.offers.some((o) => o.from === PLAYER && o.to === t);
    const army = (x) => g.militaryOf(x).length, held = (x) => g.villages.filter((v) => v.owner === x).length;
    const btn = (state, label, why) => `<button class="dbtn ${rel === state ? 'cur' : ''} ${state === 'war' ? 'warbtn' : ''}" data-act="treaty" data-team="${t}" data-state="${state}" ${rel === state || why ? 'disabled' : ''} title="${esc(why || '')}">${label}</button>`;
    const peaceWhy = !known ? 'Not met' : rel === 'war' && wait > 0 ? `Parley in ${wait}s` : pend ? 'Offer sent' : '';
    const tradeWhy = !known ? 'Not met' : rel === 'war' ? 'Make peace first' : pend ? 'Offer sent' : '';
    const html = `<div class="dhead"><b style="color:${HOUSES[t].accent}">${esc(HOUSES[t].name)}</b><span class="rel ${rel}">${known ? rel : 'unmet'}</span><button class="dx" data-act="diploclose">×</button></div>`
      + (known ? `<div class="dline">Army ${army(t)} (yours ${army(PLAYER)}) · Villages ${held(t)} (yours ${held(PLAYER)})</div>` : `<div class="dline">Not met. Scout toward them to open talks.</div>`)
      + `<div class="drow">${btn('peace', 'Peace', peaceWhy)}${btn('trade', 'Trade treaty', tradeWhy)}${btn('war', 'Declare war', '')}</div>`
      + `<div class="dnote">${rel === 'war' ? (wait > 0 ? `They will not parley for ${wait}s.` : 'They may take peace if they are not winning.') : rel === 'trade' ? 'Camels may use their markets. Peace cancels it; war breaks it.' : rel === 'peace' ? 'No fighting, no trade. A treaty lets your camels use their markets.' : ''}${pend ? ' Your offer is waiting.' : ''}</div>`;
    if (html !== this.sigDiplo) {
      this.sigDiplo = html; el.innerHTML = html;
    }
    const chip = document.querySelector(`#houses [data-house="${t}"]`);
    if (chip) { const r = chip.getBoundingClientRect(); el.style.left = Math.max(8, Math.min(window.innerWidth - 330, r.left)) + 'px'; el.style.top = r.bottom + 6 + 'px'; }
    el.classList.remove('hidden');
  }

  // ------------------------------------------------------------ per-frame
  update(dt) {
    const r = this.r, g = this.game;
    if (!this.menuOpen && !this.campaignOpen) {
      const spd = (this.keys.has('shift') ? 1100 : 620) * dt;
      let dx = 0, dy = 0;
      if (this.keys.has('w') || this.keys.has('arrowup')) dy -= spd;
      if (this.keys.has('s') || this.keys.has('arrowdown')) dy += spd;
      if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= spd;
      if (this.keys.has('d') || this.keys.has('arrowright')) dx += spd;
      if (this.mouse.in && !this.dragBox) {
        const e = 12;
        if (this.mouse.x < e) dx -= spd; if (this.mouse.x > r.w - e) dx += spd;
        if (this.mouse.y < e) dy -= spd; if (this.mouse.y > r.h - e) dy += spd;
      }
      if (dx || dy) r.panScreen(dx, dy);
    }
    for (const p of this.pings) p.age += dt;
    this.pings = this.pings.filter((p) => p.age < 0.8);
    this.pruneSel();
    // events -> toasts
    for (const ev of g.events.splice(0)) if (ev.team === PLAYER || ev.team === -1) this.toast(ev.text, ev.kind);
    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.12; this.autoSave(); this.renderOffers(); this.renderTop(); this.renderSel(); this.renderCmd(); if (this.diploOpen != null) this.renderDiplo(); }
    if (g.outcome && !this.endShown) this.showEnd();
    if (this.campaignOpen) { this.campT = (this.campT || 0) - dt; if (this.campT <= 0) { this.campT = 0.15; this.drawCampaign(); } }
  }

  toast(text, kind = 'info') {
    const box = $('toasts');
    if (box.lastChild && box.lastChild.dataset.t === text) return;
    const el = document.createElement('div'); el.className = `toast ${kind}`; el.textContent = text; el.dataset.t = text;
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.classList.add('fade'), 3800); setTimeout(() => el.remove(), 4500);
  }

  renderOffers() {
    const g = this.game;
    const html = g.offers.filter((o) => o.to === PLAYER).map((o) => `<div class="offer"><b>${esc(HOUSES[o.from].name)}</b> offers ${o.state === 'trade' ? 'a <b>trade treaty</b>' : 'peace'}.<div class="row"><button data-act="respond" data-team="${o.from}" data-accept="1">Accept</button><button data-act="respond" data-team="${o.from}" data-accept="0">Decline</button></div></div>`).join('');
    if (html !== this.sigOffers) { this.sigOffers = html; $('offers').innerHTML = html; }
  }
  renderTop() {
    const g = this.game, p = g.players[PLAYER];
    $('r-food').textContent = Math.floor(p.food); $('r-wood').textContent = Math.floor(p.wood); $('r-gold').textContent = Math.floor(p.gold);
    {
      const inc = Object.values(p.inc || {}).reduce((a, v) => a + v, 0), net = inc - (p.wageRate || 0);
      const el = $('r-net'), txt = `${net >= 0 ? '+' : '−'}${Math.abs(net).toFixed(1)}/s`;
      if (el.textContent !== txt) el.textContent = txt;
      el.className = net >= 0 ? 'up' : 'down';
      const parts = INCOME_SOURCES.filter((k) => (p.inc?.[k] || 0) >= 0.005).map((k) => `${k} +${p.inc[k].toFixed(2)}`);
      $('r-gold').parentElement.dataset.tip = encodeURIComponent(`<b>Treasury</b><br>Income ${inc.toFixed(2)}/s${parts.length ? ': ' + parts.join(', ') : ''}<br>Army pay −${(p.wageRate || 0).toFixed(2)}/s (the first ${WAGE_FREE} soldiers are household)${p.broke ? '<br><span class="need">Purse empty: soldiers fight at 70% and desert.</span>' : ''}`);
    }
    const used = g.popUsed(PLAYER), cap = g.popCap(PLAYER);
    {
      const parts = [];
      for (const k of [...MATS, 'steel', 'ware']) {
        const v = Math.floor(p[k] || 0);
        const hasMine = g.buildings.some((b) => b.team === PLAYER && b.kind === 'mine' && b.ore === k);
        if (v > 0 || hasMine) parts.push(`<span class="sk" data-tip="${encodeURIComponent(`<b>${GOOD_LABEL[k]}</b> · worth ${RES_VALUE[k]}<br><span class='info'>${esc(GOOD_INFO[k])}</span>`)}">${dot(k).replace('class="gd"', `class="gd ${k}"`)}<b>${v}</b></span>`);
      }
      if (p.arms) parts.push(`<span class="sk lv" data-tip="${encodeURIComponent(`<b>Arms level ${p.arms}</b><br>Forges feed on steel: ${ARMS_STEEL} steel per level.`)}">⚔ ${p.arms}</span>`);
      if (p.sci) parts.push(`<span class="sk lv" data-tip="${encodeURIComponent(`<b>Science: ${SCIENCE.slice(0, p.sci).join(', ')}</b><br>Academies burn ${SCI_SILVER} silver per level.`)}">✎ ${p.sci}</span>`);
      const html = parts.join('');
      if (html !== this.sigStock) { this.sigStock = html; $('stock').innerHTML = html; }
    }
    if (this.showStand) { const sh = this.standingsHtml(); if (sh !== this.sigStand) { this.sigStand = sh; $('standings').innerHTML = `<div class="ctitle">Standings · T to close</div>${sh}`; } }
    $('r-pop').textContent = `${used}/${cap}`; $('r-popwrap').classList.toggle('low', used >= cap);
    const m = Math.floor(g.time / 60), s = Math.floor(g.time % 60);
    $('clock').textContent = `${m}:${String(s).padStart(2, '0')}`;
    const counts = new Array(g.houses).fill(0); for (const v of g.villages) if (v.owner >= 0) counts[v.owner]++;
    let html = '';
    for (let i = 0; i < g.houses; i++) {
      const pl = g.players[i], me = i === PLAYER, rel = me ? '' : g.rel[PLAYER][i];
      const tip = me ? `<b>${esc(pl.name)}</b><br>${esc(HOUSES[i].motto)}` : `<b>${esc(pl.name)}</b> · relation: ${rel}<br>Click for diplomacy: peace, trade treaty or war.<br><span class='info'>${g.known[PLAYER][i] ? 'A trade treaty lets Trading Tents exchange goods.' : 'Not met yet: scout toward them to treat.'}</span>`;
      html += `<div class="hchip ${me ? 'me' : ''} ${pl.alive ? '' : 'fallen'}" data-house="${i}" data-tip="${encodeURIComponent(tip)}"><canvas width="22" height="24" data-crest="${i}"></canvas><span>${esc(HOUSES[i].short)}</span>${me ? '' : `<span class="rel ${rel}">${g.known[PLAYER][i] ? rel : '?'}</span>`}<span class="vcount">${counts[i]}v</span></div>`;
    }
    if (html !== this.sigHouses) {
      this.sigHouses = html; $('houses').innerHTML = html;
      $('houses').querySelectorAll('canvas[data-crest]').forEach((c) => { const x = c.getContext('2d'); x.clearRect(0, 0, 22, 24); drawCrest(x, 11, 12, 20, +c.dataset.crest); });
    }
    const left = g.players.filter((x) => x.alive && x.team !== PLAYER);
    const crip = left.filter((x) => (x.crippledT || 0) > 0);
    $('holdbar').innerHTML = left.length ? `Rivals left <b>${left.length}</b>${crip.length ? ' · ' + crip.map((x) => esc(HOUSES[x.team].short) + ' forfeits ' + Math.max(0, Math.ceil(FORFEIT_AFTER - x.crippledT)) + 's').join(', ') : ''}` : 'Every rival has fallen.';
    document.querySelectorAll('.res').forEach((el) => { const r = el.dataset.res; if (r) el.classList.toggle('low', p[r] < 20); });
  }

  taskText(u) {
    const t = u.task;
    switch (t.type) {
      case 'move': return 'Marching';
      case 'attack': return 'Attacking';
      case 'gather': { const n = this.game.resources[t.nodeId]; return n ? `Gathering ${RES_LABEL[NODE_RES[n.kind]].toLowerCase()}` : 'Gathering'; }
      case 'mine': return 'Digging ore';
      case 'return': return 'Carrying goods home';
      case 'build': return 'Building';
      case 'infiltrate': return 'Infiltrating';
      default: return 'Idle';
    }
  }

  renderSel() {
    const g = this.game, p = g.players[PLAYER];
    let html = '';
    const s = this.sel;
    if (s.type === 'none') {
      const serfs = g.units.filter((u) => u.team === PLAYER && u.kind === 'serf' && u.hp > 0).length;
      const army = g.militaryOf(PLAYER).length;
      const vs = g.villagesOf(PLAYER).length;
      html = `<div class="seltitle">${esc(HOUSES[PLAYER].name)}</div><div class="selsub">${esc(HOUSES[PLAYER].motto)}</div>
        <div class="stat"><label>Serfs</label><span>${serfs}</span></div><div class="stat"><label>Soldiers</label><span>${army}</span></div><div class="stat"><label>Villages</label><span>${vs} of ${g.villages.length}</span></div>
        <div class="selsub">Press <b>H</b> for your home village: draft serfs and raise buildings. Drag to select units. Right-click to act.</div>`;
    } else if (s.type === 'units') {
      const us = this.selUnits();
      if (us.length === 1) {
        const u = us[0], st = UNITS[u.kind], mine = u.team === PLAYER;
        html = `${portrait(u.kind, HOUSES[u.team].accent)}<div class="seltitle">${esc(u.name || st.label)} <small style="color:${HOUSES[u.team].accent};font-size:12px">${st.label} · ${esc(HOUSES[u.team].short)}</small></div><div class="selsub">${u.name ? `${u.trait ? `${esc(TRAITS[u.trait]?.label || '')}${u.origin ? ' of ' + esc(u.origin) : ''}<br>` : u.origin ? `Born in ${esc(u.origin)}<br>` : ''}` : ''}${esc(st.info)}</div>
          <div class="stat"><label>Can</label><span>${esc(ABILITIES[u.kind] || '')}</span></div>
          <div class="stat"><label>Health</label><div class="meter"><i class="hp" style="width:${(u.hp / u.maxHp) * 100}%"></i></div><span class="v">${Math.ceil(u.hp)}/${u.maxHp}</span></div>
          <div class="stat"><label>Damage</label><span>${st.dmg}${st.range > 1.6 ? ' ranged' : ''}</span><label>Speed</label><span>${st.speed}</span></div>
          ${mine ? `<div class="stat"><label>Task</label><span>${this.taskText(u)}${u.carry && u.carry.amount > 0.5 ? ` · ${Math.floor(u.carry.amount)} ${u.carry.kind}` : ''}</span></div>` : ''}`;
      } else {
        const by = {}; us.forEach((u) => { by[u.kind] = (by[u.kind] || 0) + 1; });
        html = `<div class="seltitle">${us.length} units</div><div class="selsub">${us.length <= 8 ? esc(us.map((u) => u.name?.split(' ')[0]).filter(Boolean).join(', ')) + '. ' : ''}Click a type to narrow the selection. Ctrl+1..9 stores a group.</div><div class="chips">${Object.entries(by).map(([k, n]) => `<span class="chip x" data-act="kind" data-kind="${k}">${GLYPH[k]?.length === 1 ? GLYPH[k] : ''} ${UNITS[k].label} × ${n}</span>`).join('')}</div>`;
      }
    } else if (s.type === 'building') {
      const b = g.byId.get(s.id); if (!b) { this.clearSel(); return; }
      const st = BUILDINGS[b.kind], mine = b.team === PLAYER;
      html = `${portrait(b.kind, HOUSES[b.team].accent, b.team)}<div class="seltitle">${st.label} <small style="color:${HOUSES[b.team].accent};font-size:12px">${esc(HOUSES[b.team].short)}</small></div><div class="selsub">${esc(st.info)}</div>${b.town != null && g.byId.get(b.town) ? `<div class="hint">Part of the town of <b>${esc(g.byId.get(b.town).name)}</b>: it changes hands with the village.</div>` : ''}
        <div class="stat"><label>Health</label><div class="meter"><i class="hp" style="width:${(b.hp / b.maxHp) * 100}%"></i></div><span class="v">${Math.ceil(b.hp)}/${b.maxHp}</span></div>`;
      if (b.built < 1) html += `<div class="stat"><label>Building</label><div class="meter"><i class="prog" style="width:${b.built * 100}%"></i></div><span class="v">${Math.floor(b.built * 100)}%</span></div><div class="selsub">Right-click with serfs to help.</div>`;
      if (mine && b.built >= 1 && st.pop) html += `<div class="stat"><label>Population</label><span>+${st.pop}</span></div>`;
      if (mine && b.queue.length) {
        html += `<div class="qrow">${b.queue.map((q, i) => `<div class="qslot" data-act="cancel" data-i="${i}" data-tip="${encodeURIComponent(`<b>${UNITS[q.kind].label}</b><br>Click to cancel (refund).`)}">${GLYPH[q.kind].length === 1 ? GLYPH[q.kind] : 'R'}${i === 0 ? `<i style="width:${(q.t / UNITS[q.kind].time) * 100}%"></i>` : ''}</div>`).join('')}</div>`;
      }
      if (mine && b.built >= 1 && GARRISON[b.kind]) {
        const inn = b.garrison.map((id) => g.byId.get(id)).filter(Boolean);
        html += `<div class="stat"><label>Garrison</label><span>${inn.length}/${GARRISON[b.kind]} inside${b.kind === 'keep' ? ' (heal while inside)' : ''}</span></div>`;
        if (inn.length) html += `<div class="chips">${inn.map((u) => `<span class="chip x ${this.gsel === u.id ? 'on' : ''}" data-act="gsel" data-id="${u.id}" data-tip="${encodeURIComponent(`<b>${esc(u.name || UNITS[u.kind].label)}</b><br>${UNITS[u.kind].label}${u.trait ? ' · ' + TRAITS[u.trait].label : ''} · ${Math.ceil(u.hp)}/${u.maxHp} hp${u.drilling ? '<br>In training' : ''}`)}">${GLYPH[u.kind]?.length === 1 ? GLYPH[u.kind] : ''} ${esc(u.name || UNITS[u.kind].label)}${u.drilling ? ' …' : ''}</span>`).join('')}</div>`;
      }
      if (mine && b.kind === 'keep' && b.built >= 1) { const lv = b.levy != null ? g.byId.get(b.levy) : null; html += `<div class="stat"><label>Levy</label><span>${lv ? `${esc(lv.name)} (${Math.floor(lv.pop)} villagers left)` : 'none: right-click a village you hold'}</span></div>`; }
      if (b.kind === 'mine' && b.built >= 1) {
        const left = b.nodeIds.reduce((a, id) => a + Math.max(0, g.resources[id].amount), 0), max = b.nodeIds.reduce((a, id) => a + g.resources[id].max, 0);
        html += `<div class="stat"><label>${GOOD_LABEL[b.ore]}</label><div class="meter"><i class="ore" style="width:${(left / max) * 100}%"></i></div><span class="v">${Math.ceil(left)}</span></div><div class="stat"><label>Diggers</label><span>${g.minersOf(b)}/${MINE_MAX_WORKERS}</span></div>`;
      }
      if (mine && b.kind === 'foundry' && b.built >= 1) html += `<div class="stat"><label>Furnace</label><span>${b.job ? `smelting ${GOOD_LABEL[b.job.kind].toLowerCase()} ${Math.floor((b.job.t / SMELT[b.job.kind].time) * 100)}%` : 'cold: needs iron + coal, or copper + coal'}</span></div>`;
      if (mine && b.kind === 'forge' && b.built >= 1) html += `<div class="stat"><label>Arms</label><span>level ${p.arms}/3 · ${Math.floor(p.steel)}/${ARMS_STEEL} steel for the next</span></div>`;
      if (mine && b.kind === 'academy') html += `<div class="stat"><label>Science</label><span>${p.sci ? SCIENCE.slice(0, p.sci).join(', ') : 'none'} · ${Math.floor(p.silver)}/${SCI_SILVER} silver for the next</span></div>`;
      if (mine && b.kind === 'academy') html += `<div class="stat"><label>Scholars</label><span>${b.scholars || 0}/4 near: +${(b.scholars || 0) * 30}% influence</span></div>`;
    } else if (s.type === 'village') {
      const v = g.byId.get(s.id); if (!v) { this.clearSel(); return; }
      const k = VILLAGE_KINDS[v.kind], lord = v.owner >= 0 ? HOUSES[v.owner].name : 'Independent';
      const tr = k.tribute;
      html = `<div class="seltitle">${esc(v.name)} <small style="color:#cdbb8a;font-size:12px">${v.founded ? 'Village' : k.label}</small></div><div class="selsub">${v.founded ? 'Founded by your house. Its folk till, pay tax and can be drafted.' : esc(k.blurb)}${v.owner === PLAYER ? ` Tax <b>+${(v.pop * TAX * (v.loyalty / 100)).toFixed(2)}</b> coin/s.` : ''}</div>
        <div class="stat"><label>Lord</label><span>${esc(lord)}</span></div>
        <div class="stat"><label>Loyalty</label><div class="meter"><i class="loy" style="width:${v.loyalty}%"></i></div><span class="v">${v.loyalty | 0}</span></div>
        <div class="stat"><label>Protection</label><div class="meter"><i class="pro" style="width:${(v.protection / v.maxProtection) * 100}%"></i></div><span class="v">${v.protection | 0}/${v.maxProtection}</span></div>
        <div class="stat"><label>Population</label><div class="meter"><i class="loy" style="width:${(v.pop / v.popMax) * 100}%"></i></div><span class="v">${Math.floor(v.pop)}/${v.popMax}</span></div>
        <div class="stat"><label>Folk</label><span>${v.folk.join(', ')} · ${v.hunger ? '<b style="color:#e0866a">starving: the store is out of grain</b>' : v.pop >= v.popMax ? 'at full strength' : 'growing (fed from the village store)'} · grain ${Math.floor(v.stores.food || 0)}</span></div>${v.owner === PLAYER ? `<div class="stat"><label>Housing</label><span>houses ${Math.floor(v.pop * POP_HOUSING)} of your population cap; tribute ${Math.round((0.5 + 0.7 * (v.pop / v.popMax)) * 100)}% of base</span></div>` : ''}
        <div class="stat"><label>Influence</label><span>${this.pullText(v)}</span></div>${v.joyT > 0 ? `<div class="stat"><label>Mood</label><span style="color:#9fe08f">Content (fine ware): +30% tribute</span></div>` : v.owner === PLAYER ? `<div class="stat"><label>Mood</label><span>Fine ware from a foundry (copper + coal) near a market, tavern or temple would please them.</span></div>` : ''}`;
    } else if (s.type === 'node') {
      const n = g.resources[s.id]; if (!n) { this.clearSel(); return; }
      const res = NODE_RES[n.kind];
      if (MINEABLE.includes(n.kind)) {
        const m = g.buildings.find((b) => b.kind === 'mine' && b.hp > 0 && b.nodeIds?.includes(n.id));
        html = `<div class="seltitle">${GOOD_LABEL[n.kind]} deposit</div><div class="selsub">${esc(GOOD_INFO[n.kind])} ${m ? '' : 'Raise a <b>Mine</b> on it, then assign serfs.'}</div><div class="stat"><label>Remaining</label><span>${Math.ceil(n.amount)}</span></div><div class="stat"><label>Worth</label><span>${RES_VALUE[n.kind]} each</span></div>`;
        if (html !== this.sigSel) { this.sigSel = html; $('selPanel').innerHTML = html; }
        return;
      }
      html = `<div class="seltitle">${{ tree: 'Timber stand', berry: 'Berry bushes' }[n.kind]}</div><div class="selsub">Right-click with serfs to gather ${RES_LABEL[res].toLowerCase()}.</div><div class="stat"><label>Remaining</label><span>${Math.ceil(n.amount)}</span></div>`;
    }
    if (html !== this.sigSel) { this.sigSel = html; $('selPanel').innerHTML = html; }
  }

  btn(act, o) {
    const tip = encodeURIComponent(o.tip);
    return `<button class="cbtn ${o.off ? 'off' : ''} ${o.cls || ''}" data-act="${act}" ${Object.entries(o.data || {}).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')} data-tip="${tip}"><span class="g ${o.art ? 'art' : ''}">${o.art ? icon(o.art, o.glyph) : o.glyph}</span><span class="n">${esc(o.name)}</span>${o.sub ? `<span class="c">${o.sub}</span>` : ''}</button>`;
  }
  buildGrid() {
    const g = this.game, p = g.players[PLAYER];
    let html = `<div class="ctitle">Raise a building</div><div class="cgrid">`;
    const locked = [];
    for (const kind of BUILD_ORDER_UI) {
      const s = BUILDINGS[kind];
      const miss = s.requires.filter((r) => !g.hasBuilding(PLAYER, r)).map((r) => BUILDINGS[r].label);
      if (miss.length) { locked.push(`${s.label.replace('Watchtower', 'Tower').replace('Archery Range', 'Archery')} (${miss.join(' + ')})`); continue; }   // not unlocked yet: hidden
      const afford = g.canAfford(PLAYER, s.cost);
      const tip = `<b>${s.label}</b><br><span class="info">${esc(s.info)}</span><br><span class="cost">${costText(s.cost, p)}</span> · ${s.time}s`;
      html += this.btn('place', { off: !afford, glyph: GLYPH[kind], art: kind, name: s.label.replace('Watchtower', 'Tower').replace('Archery Range', 'Archery'), sub: costShort(s.cost), data: { kind }, tip });
    }
    html += `</div>`;
    if (locked.length) html += `<div class="hint">Unlocks as you build: ${esc(locked.join(', '))}.</div>`;
    return html;
  }
  trainGrid(b) {
    const g = this.game, p = g.players[PLAYER];
    const kinds = Object.keys(UNITS).filter((k) => UNITS[k].from.includes(b.kind));
    if (!kinds.length) return '';
    let html = `<div class="ctitle">Train</div><div class="cgrid">`;
    for (const k of kinds) {
      const s = UNITS[k];
      const afford = g.canAfford(PLAYER, s.cost), room = g.popUsed(PLAYER) < g.popCap(PLAYER);
      const tip = `<b>${s.label}</b><br><span class="info">${esc(s.info)}</span><br>HP ${s.hp} · dmg ${s.dmg}${s.range > 1.6 ? ' (ranged)' : ''} · speed ${s.speed}<br><span class="cost">${costText(s.cost, p)}</span> · ${s.time}s${room ? '' : '<br><span class="need">Population capped: raise cottages.</span>'}`;
      html += this.btn('train', { off: !afford || !room, glyph: GLYPH[k], art: k, name: s.label, sub: costShort(s.cost), data: { kind: k }, tip });
    }
    return html + `</div>`;
  }
  rosterPanel(b) {
    const g = this.game, p = g.players[PLAYER];
    let html = `<div class="ctitle">Wanderers for hire (new faces every ${Math.round(120 / 60)} min)</div><div class="cgrid">`;
    b.roster.forEach((w, i) => {
      const t = TRAITS[w.trait], afford = g.canAfford(PLAYER, w.cost);
      const tip = `<b>${esc(w.name)}</b> · ${t.label}<br><span class="info">${t.hp > 1 ? `+${Math.round((t.hp - 1) * 100)}% health. ` : ''}${t.dmg ? `+${t.dmg} damage. ` : ''}${t.spd ? `Faster. ` : ''}${w.trait === 'green' ? 'Untrained but cheap.' : ''}Drill them in a keep to make a soldier.</span><br><span class="cost">${costText(w.cost, p)}</span>`;
      html += this.btn('hire', { off: !afford, glyph: '☗', art: 'recruit', name: `${w.name}`, sub: `${t.label} · ${costShort(w.cost)}`, data: { i }, tip });
    });
    return html + `</div><div class="hint">Hired wanderers walk to the rally point (right-click ground). Right-click a keep with them to garrison and drill.</div>`;
  }
  keepPanel(b) {
    const g = this.game, p = g.players[PLAYER];
    let html = `<div class="ctitle">Drill garrisoned recruits and serfs</div><div class="cgrid">`;
    for (const k of Object.keys(DRILL)) {
      const d = DRILL[k], afford = g.canAfford(PLAYER, d.cost);
      html += this.btn('drill', { off: !afford, glyph: GLYPH[k], art: k, name: UNITS[k].label, sub: `${costShort(d.cost)} · ${d.time}s`, data: { kind: k }, tip: `<b>Drill a ${UNITS[k].label.toLowerCase()}</b><br><span class="info">Turns the highlighted garrisoned recruit or serf (else the first one) into a ${UNITS[k].label.toLowerCase()}. Keeps their traits.</span><br><span class="cost">${costText(d.cost, p)}</span>` });
    }
    html += this.btn('leave', { glyph: '⇥', name: 'Leave', tip: '<b>Leave</b><br>Everyone steps out.' });
    return html + `</div><div class="hint">Right-click the keep with units to garrison them, or a village you hold to <b>levy villagers</b>.</div>`;
  }
  treatyRows() {
    const g = this.game; let html = '';
    for (let i = 0; i < g.houses; i++) {
      if (i === PLAYER || !g.alive(i)) continue;
      const rel = g.rel[PLAYER][i], known = g.known[PLAYER][i], pend = g.offers.some((o) => o.from === PLAYER && o.to === i && o.state === 'trade');
      html += `<div class="treaty"><span class="nm">${esc(HOUSES[i].short)}</span><span class="rel ${rel}">${known ? rel : 'unmet'}</span>${known ? (rel === 'trade' ? `<button data-act="treaty" data-team="${i}" data-state="peace">Cancel</button>` : pend ? '<span class="hint">offer sent</span>' : rel === 'war' ? '<span class="hint">at war</span>' : `<button data-act="treaty" data-team="${i}" data-state="trade">Propose trade</button>`) : '<span class="hint">scout to meet</span>'}</div>`;
    }
    return html;
  }
  goodChips(map, act, sel, cap) {
    return `<div class="goods">${ALL_GOODS.map((x) => { const n = Math.floor(map?.[x] || 0); if (act !== 'want' && map && n < 1) return ''; return `<span class="gchip ${sel === x ? 'on' : ''} ${act && n < 1 && act !== 'want' ? 'off' : ''}" ${act ? `data-act="${act}" data-good="${x}"` : ''} data-tip="${encodeURIComponent(`<b>${GOOD_LABEL[x]}</b> · worth ${RES_VALUE[x]}${cap ? `<br>${n} / ${cap}` : ''}`)}">${dot(x)}${GOOD_LABEL[x]}${n ? ` ${n}` : ''}</span>`; }).join('')}</div>`;
  }
  // the community round a market: which of the four links stand within reach, and what they are worth
  districtHtml(m) {
    const g = this.game, d = g.district(m);
    const chip = (k) => `<span class="lk ${d.links[k] > 0 ? 'on' : ''}" data-tip="${encodeURIComponent(`<b>${LINKS[k].label}</b><br>${d.links[k] > 0 ? 'Here: ' + esc(d.names[k].slice(0, 4).join(', ')) : 'Missing: ' + LINKS[k].tip}`)}">${LINKS[k].label} ${d.links[k]}</span>`;
    const miss = Object.keys(LINKS).filter((k) => !d.links[k]);
    return `<div class="ctitle">Community · ${d.score}/4 links${d.thriving ? ' · thriving' : ''} · market coin ×${d.mult.toFixed(2)}</div><div class="links">${Object.keys(LINKS).map(chip).join('<span class="arr">→</span>')}</div>`
      + `<div class="hint">${miss.length ? `Add ${miss.map((k) => LINKS[k].label.toLowerCase()).join(' and ')} within ${DISTRICT.r} tiles: each link adds +${Math.round(DISTRICT.perLink * 100)}% market coin, faster foundries, richer villages.` : 'Supply feeds works, works feed the market, homes and service keep it paid. Foundries here run fast; villages here pay more.'}</div>`;
  }
  // where a mine or foundry stands in the chain
  chainLine(b) {
    const g = this.game, d = g.districtAt(PLAYER, b.x, b.y), m = g.nearestMarket(PLAYER, b.x, b.y, DISTRICT.r);
    if (b.kind === 'mine') return d ? `<div class="hint">Ore flows to your market ${Math.round(Math.hypot(b.x - m.x, b.y - m.y))} tiles away. Its community of ${d.score}/4 speeds the haul by <b>+${8 * d.score}%</b>. A foundry beside it turns ore into steel and ware.</div>` : `<div class="hint">No market of yours within ${DISTRICT.r} tiles: ore reaches your stores slowly. Raise a market and a foundry beside it.</div>`;
    if (b.kind === 'foundry') return d ? `<div class="hint">In a community of ${d.score}/4: this foundry works at <b>×${(0.8 + 0.15 * d.score + (d.links.supply > 0 ? 0.3 : 0)).toFixed(2)}</b>${d.links.supply > 0 ? '' : ' (a mine, farm or mill beside it adds +0.30)'}.</div>` : `<div class="hint">Alone: no market within ${DISTRICT.r} tiles, so it works at ×${DISTRICT.lone}. Build it beside a market and a mine.</div>`;
    return '';
  }
  marketPanel(b) {
    const g = this.game, shelf = b.stock || {}, any = ALL_GOODS.some((k) => (shelf[k] || 0) >= 1);
    let html = this.districtHtml(b) + `<div class="tentwrap"><div class="tcol"><div class="ctitle">Treaties (houses you have met)</div>${this.treatyRows()}<div class="hint">Trade treaties let your camels use their markets.</div></div>`;
    html += `<div class="tcol"><div class="ctitle">Shelf (fed by mines, foundries, farms, mills and warehouses within ${MARKET_RADIUS} tiles)</div>${any ? this.goodChips(shelf, '', null, SHELF_CAP) : '<div class="hint">Empty: raise a mine, foundry, farm or warehouse near this market.</div>'}`;
    const me = g.players[PLAYER], sellable = ALL_GOODS.filter((k) => k !== 'gold' && (me[k] || 0) >= 1);
    html += `<div class="ctitle">Sell from your stockpile (click = 20) · price falls as you sell</div>${sellable.length ? `<div class="goods sellrow">${sellable.map((k) => `<span class="gchip" data-act="sell" data-good="${k}" data-tip="${encodeURIComponent(`<b>Sell ${GOOD_LABEL[k]}</b><br>${g.sellPrice(b, k).toFixed(2)} coin each now (worth ${(RES_VALUE[k] / RES_VALUE.gold).toFixed(1)}).<br>Caravans to a distant market or village fetch more.`)}">${dot(k)}${GOOD_LABEL[k]} ${Math.floor(me[k])} · ${g.sellPrice(b, k).toFixed(1)}c</span>`).join('')}</div>` : '<div class="hint">Nothing in the stockpile worth selling yet. Mines and foundries fill it.</div>'}`;
    html += `<div class="hint">Train a <b>camel</b>, select it, then click up to three markets for its loop. Trade so far: <b>+${Math.floor(me.tradeEarned || 0)} coin</b> over ${me.trips || 0} trips.</div></div></div>`;
    return html;
  }
  // a market that is not the camel's own base: what is on its shelf, what a camel could earn there per trip, and a camel to send
  tradeBoard(t) {
    const g = this.game;
    if (t.type === 'village') return `<div class="hint">Camels trade only with markets. Raise a market near this village and its folk become customers.</div>`;
    const chk = g.canDeal(PLAYER, t);
    const name = chk.own ? 'Your market' : `${HOUSES[t.team].short}'s market`;
    let html = `<div class="ctitle">${esc(name)} · goods and what a camel earns here</div>`;
    if (!chk.ok) return html + `<div class="hint">${esc(chk.reason)} Open the diplomacy panel (click their house at the top) to propose a trade treaty.</div>`;
    const have = ALL_GOODS.filter((k) => k !== 'gold' && g.stockOf(t, k) >= 1);
    html += `<div class="hint">${chk.own ? 'A camel can move your surplus here from its home shelf.' : `Coin in their purse: <b>${g.availFor(t, 'gold')}</b>.`} ${have.length ? 'On the shelf:' : 'The shelf is empty.'}</div>`;
    if (have.length) html += `<div class="goods">${have.map((k) => `<span class="gchip" data-tip="${encodeURIComponent(`<b>${GOOD_LABEL[k]}</b><br>Pays ${g.priceAt(t, k).toFixed(1)} each (worth ${RES_VALUE[k]})`)}">${dot(k)}${GOOD_LABEL[k]} ${g.stockOf(t, k)} · ${g.priceAt(t, k).toFixed(1)}</span>`).join('')}</div>`;
    const camels = g.units.filter((u) => u.team === PLAYER && u.kind === 'camel' && u.hp > 0);
    html += `<div class="ctitle">Send a camel (it keeps up to ${ROUTE_STOPS} markets on a loop)</div>`;
    if (!camels.length) return html + `<div class="hint">Train a camel at one of your markets first.</div>`;
    const busy = (u) => (u.route?.stops?.length ? 1 : 0);
    const rows = camels.slice().sort((a, b) => busy(a) - busy(b) || Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y)).slice(0, 9);
    html += `<div class="cgrid">${rows.map((u) => {
      const home = g.routeHome(u), on = u.route?.stops?.includes(t.id), full = !on && (u.route?.stops?.length || 0) >= ROUTE_STOPS;
      const isHome = home && home.id === t.id, q = home && !isHome ? g.quoteStop(home, t) : null;
      const sub = on ? 'on its loop · click to remove' : isHome ? 'its home market' : full ? 'already has 3 markets' : q && q.n >= 4 ? (chk.own ? 'moves goods here' : `+${Math.floor(q.profit)} coin a trip`) : 'nothing worth carrying yet';
      return this.btn('routecamel', { glyph: '🐪', art: 'camel', name: esc(u.name?.split(' ')[0] || 'Camel'), sub, off: isHome || full, data: { id: u.id }, tip: `<b>${esc(u.name || 'Camel')}</b><br>${on ? 'Click to take this market off its loop.' : 'Adds this market to its loop: home shelf, here, home, next market, home... until stopped.'}${u.route?.stops?.length ? `<br>${u.route.stops.length} market${u.route.stops.length > 1 ? 's' : ''} on its loop now.` : ''}` });
    }).join('')}</div>`;
    return html;
  }
  standingsHtml() {
    const g = this.game, rows = g.standings();
    const best = (k) => Math.max(...rows.map((r) => r[k]));
    const cell = (r, k, f = (x) => x) => `<td class="${r[k] === best(k) && r[k] > 0 ? 'lead' : ''}">${f(r[k])}</td>`;
    return `<table class="stand"><tr><th></th><th>Money</th><th>Land</th><th>Folk</th><th>Army</th><th>Science</th><th>Loyalty</th></tr>${rows.map((r) => `<tr class="${r.team === PLAYER ? 'me' : ''} ${r.alive ? '' : 'fallen'}"><td style="color:${HOUSES[r.team].accent}">${esc(HOUSES[r.team].short)}</td>${cell(r, 'money')}${cell(r, 'land')}${cell(r, 'pop')}${cell(r, 'army')}${cell(r, 'sci')}${cell(r, 'loyalty', (x) => x + '%')}</tr>`).join('')}</table>`;
  }
  // a camel's loop: its markets, what each is worth per trip, and how to change them
  camelPanel(us) {
    const g = this.game, u = us[0], single = us.length === 1, r = u.route, stops = (r?.stops || []).map((id) => g.byId.get(id)).filter(Boolean);
    const home = g.routeHome(u), total = g.cargoTotal(u);
    let html = `<div class="ctitle">${single ? esc(u.name || 'Camel') : us.length + ' camels'} · loop of ${stops.length}/${ROUTE_STOPS} markets${single ? ` · carrying ${Math.floor(total)}/${CAMEL_CAP}` : ''}</div>`;
    if (!home) html += `<div class="hint">Raise a market first: a camel works out of one of yours.</div>`;
    else html += `<div class="hint">Home: <b>${esc(HOUSES[PLAYER].short)}'s market</b> (${Math.round(Math.hypot(u.x - home.x, u.y - home.y))} tiles away).</div>`;
    if (stops.length) {
      html += `<div class="stoplist">${stops.map((m, i) => {
        const q = home ? g.quoteStop(home, m) : { n: 0, profit: 0 }, own = m.team === PLAYER, here = single && r.i === i && u.task.stage && u.task.stage !== 'wait';
        return `<div class="stoprow ${here ? 'cur' : ''}"><span class="sn">${i + 1}. ${esc(g.stopName(m))}</span><span class="st">${q.n >= 4 ? (own ? 'moves goods' : `+${Math.floor(q.profit)} coin/trip`) : 'nothing to carry yet'}</span><button class="cbtn mini" data-act="routestop" data-market="${m.id}" data-tip="${encodeURIComponent('<b>Remove this stop</b>')}">×</button></div>`;
      }).join('')}</div>`;
      if (single) html += `<div class="hint">${r.trips} trips so far, <b>+${Math.floor(r.earned)} coin</b>. Now: ${esc(({ prep: 'at home, loading', wait: 'at home, loading', out: 'on the road to a market', back: 'walking home', home: 'walking home' })[u.task.stage] || 'idle')}.</div>`;
      html += `<div class="cgrid c4">${this.btn('stopgo', { glyph: '■', name: 'Stop loop', tip: '<b>Stop loop</b><br>Finish up and come home; clears every stop.' })}</div>`;
    }
    html += stops.length < ROUTE_STOPS ? `<div class="hint"><b>Click a market</b> on the map to add it (yours, or a treaty partner's). Click one of its stops again to remove it.</div>` : `<div class="hint">Three markets: the loop is full. Click a stop's × to swap one.</div>`;
    return html;
  }
  pullText(v) {
    const g = this.game, pulls = g.pullsFor(v);
    const parts = pulls.map((p, t) => [t, p]).filter(([, p]) => p > 0.02).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, p]) => `<b style="color:${HOUSES[t].accent}">${esc(HOUSES[t].short)}</b> ${p.toFixed(1)}`);
    return parts.length ? parts.join(' · ') : 'none: no castle, temple, tavern or market near';
  }
  villageActs(v) {
    const g = this.game, mine = v.owner === PLAYER;
    const spies = g.units.filter((u) => u.team === PLAYER && u.kind === 'spy' && u.hp > 0).length, recs = g.units.filter((u) => u.team === PLAYER && u.kind === 'recruit' && u.hp > 0).length;
    const army = g.militaryOf(PLAYER).length, camels = g.units.filter((u) => u.team === PLAYER && u.kind === 'camel' && u.hp > 0).length;
    let html = `<div class="ctitle">Options</div><div class="cgrid">`;
    html += this.btn('keephere', { glyph: '♚', art: 'keep', name: 'Raise keep', sub: costShort(BUILDINGS.keep.cost), off: !g.canAfford(PLAYER, BUILDINGS.keep.cost), tip: '<b>Raise a keep beside it</b><br>A keep with soldiers inside sways this village (and draws it from a rival). Then garrison it.' });
    if (mine) {
      html += this.btn('entervillage', { glyph: '⇥', name: 'Garrison', off: !army, tip: '<b>Garrison</b><br>Sends idle soldiers inside (max 8).' });
      const free = Math.floor(v.pop) - DRAFT.minLeft, room = g.popCap(PLAYER) + 1 - g.popUsed(PLAYER), food = g.players[PLAYER].food;
      const minesOpen = g.buildings.some((b) => b.team === PLAYER && b.kind === 'mine' && b.built >= 1 && b.hp > 0 && g.minersOf(b) < MINE_MAX_WORKERS);
      html += this.btn('draft', { glyph: GLYPH.serf, art: 'serf', name: 'Serf', sub: SETTLE_FOOD + 'g', data: { role: 'serf', n: 1 }, off: free < 1 || room < 1 || food < SETTLE_FOOD, tip: `<b>Draft a serf</b><br>One villager becomes a serf of yours (${SETTLE_FOOD} grain). Serfs gather, build and dig.` });
      html += this.btn('draft', { glyph: GLYPH.serf, art: 'serf', name: 'Serfs ×5', sub: SETTLE_FOOD * 5 + 'g', data: { role: 'serf', n: 5 }, off: free < 1 || room < 1 || food < SETTLE_FOOD, tip: `<b>Draft serfs</b><br>Up to five villagers leave as serfs (${SETTLE_FOOD} grain each). They regrow while the village has grain.` });
      html += this.btn('draft', { glyph: '⛏', art: 'mine', name: 'Miners ×4', sub: DRAFT.mineFood * 4 + 'g', data: { role: 'mine', n: 4 }, off: free < 1 || room < 1 || !minesOpen || food < DRAFT.mineFood, tip: '<b>Send miners</b><br>Villagers walk to your nearest mine with free places and start digging.' });
      html += this.btn('draft', { glyph: '⚔', art: 'footman', name: 'Soldiers ×5', sub: `${DRAFT.soldierFood}g${g.hasBuilding(PLAYER, 'barracks') ? ' +15c' : ''}`, data: { role: 'soldier', n: 5 }, off: free < 1 || room < 1 || food < DRAFT.soldierFood, tip: `<b>Raise soldiers</b><br>Villagers take up spears: footmen if you have a barracks (needs coin for arms), otherwise recruits to drill in a keep. Soldiers beyond the first ${WAGE_FREE} draw pay.` });
    } else {
      html += this.btn('sendspy', { glyph: GLYPH.spy, art: 'spy', name: 'Send spy', off: !spies, sub: spies ? `${spies} ready` : 'need a spy', tip: `<b>Send a spy</b><br>Sways loyalty without a fight. Spies can be caught.${spies ? '' : `<br><span class="need">Hire a recruit at a tavern, select it, press Become spy (${SPY_FEE} coin).</span>`}` });
      html += this.btn('sendarmy', { glyph: '⚔', name: 'Send army', off: !army, sub: army ? `${army} soldiers` : '', tip: '<b>Sack</b><br>Sends every soldier to attack. Protection must reach zero.' });
    }
    return html + `</div>`;
  }

  // serfs: one set of job buttons for the whole group, and a row for each serf with its own
  serfPanel(serfs) {
    const job = (j, glyph, label, id, tip) => `<button class="cbtn mini" data-act="serfjob" data-job="${j}" ${id != null ? `data-id="${id}"` : ''} data-tip="${encodeURIComponent(tip)}">${glyph} ${label}</button>`;
    let html = `<div class="ctitle">Serfs (${serfs.length})</div><div class="serfjobs">${job('wood', '🪓', 'Cut timber', null, '<b>Cut timber</b><br>Each selected serf walks to the nearest tree on your ground and starts felling.')}${job('food', '🫐', 'Pick berries', null, '<b>Pick berries</b><br>Each selected serf goes to the nearest berry bush on your ground.')}${job('home', '⌂', 'Go home', null, '<b>Go home</b><br>Each selected serf walks back to the nearest village of yours and goes inside.')}</div>`;
    if (serfs.length > 1) html += serfs.slice(0, 10).map((u) => `<div class="serfrow"><span class="sn">${esc(u.name || 'Serf')}</span><span class="st">${esc(this.taskText(u))}</span>${job('wood', '🪓', '', u.id, '<b>Cut timber</b>')}${job('home', '⌂', '', u.id, '<b>Go home</b>')}</div>`).join('') + (serfs.length > 10 ? `<div class="hint">…and ${serfs.length - 10} more.</div>` : '');
    else html += `<div class="hint">${esc(serfs[0].name || 'Serf')}: <b>${esc(this.taskText(serfs[0]))}</b></div>`;
    return html;
  }

  renderCmd() {
    const g = this.game, s = this.sel;
    let html = '';
    const us = this.selUnits().filter((u) => u.team === PLAYER);
    const ent = this.selEntity();
    if (s.type === 'units' && us.length) {
      if (us.some((u) => u.kind === 'serf' || BUILDERS[u.kind])) html += this.buildGrid();
      if (us.some((u) => u.kind === 'serf')) html += this.serfPanel(us.filter((u) => u.kind === 'serf'));
      if (us.some((u) => u.kind === 'serf')) html += `<div class="hint">Right-click a site to build; <b>Shift</b>+right-click (or Shift+place) <b>queues</b> more. Right-click a keep or your village to go inside.</div>`;
      html += `<div class="cgrid c4" style="margin-top:6px">${this.btn('stop', { glyph: '■', name: 'Stop', tip: '<b>Stop</b><br>Halt and hold position.', cls: '' })}</div>`;
      if (us.some((u) => u.kind === 'camel')) html += this.camelPanel(us.filter((u) => u.kind === 'camel'));
      if (us.some((u) => u.kind === 'recruit')) html += `<div class="ctitle">Role</div><div class="cgrid c4">${this.btn('spy', { glyph: GLYPH.spy, art: 'spy', name: 'Become spy', sub: SPY_FEE + 'c', off: g.players[PLAYER].gold < SPY_FEE, tip: `<b>Become a spy</b><br>${SPY_FEE} coin. Spies right-click an independent or rival village to sway its loyalty (and can be caught).` })}</div><div class="hint">Or right-click a keep to garrison, then drill into a soldier.</div>`;
      if (us.some((u) => u.kind === 'serf')) html += `<div class="hint">Right-click: a deposit with a <b>mine</b> to dig, timber, berries or gold to gather, a building site to build.</div>`;
      if (!us.some((u) => u.kind === 'serf' || u.kind === 'camel' || u.kind === 'recruit')) {
        const sp = us.some((u) => u.kind === 'spy');
        html += `<div class="hint">Right-click: <b>move</b>, <b>attack</b> a foe, <b>sack</b> a village${sp ? ', or send the <b>spy</b> in to turn its loyalty' : ''}. Right-click your own <b>keep, tower, barracks</b> or a village you hold to go <b>inside</b>. Attacking a house at peace declares war.</div>`;
      }
    } else if (ent && ent.type === 'building' && ent.team === PLAYER) {
      if (ent.built < 1) html = `<div class="hint">Under construction. Select serfs and right-click this building to help raise it.</div>`;
      else {
        html += this.trainGrid(ent);
        if (ent.kind === 'market') html += this.marketPanel(ent);
        if (ent.kind === 'tavern' && ent.roster) html += this.rosterPanel(ent);
        if (ent.kind === 'keep') html += this.keepPanel(ent);
        else if (GARRISON[ent.kind] && ent.garrison.length) html += `<div class="cgrid" style="margin-top:6px">${this.btn('leave', { glyph: '⇥', name: 'Leave', tip: '<b>Leave</b><br>Everyone steps out.' })}</div>`;
        if (ent.kind === 'mine') html += `<div class="ctitle">Diggers</div><div class="cgrid">${this.btn('mineidle', { glyph: '⛏', name: 'Send serfs', tip: '<b>Assign serfs</b><br>Sends the nearest idle or gathering serfs to dig here (max 4).' })}${this.btn('unmine', { glyph: '■', name: 'Release', tip: '<b>Release diggers</b><br>They stand down.' })}</div><div class="hint">Or select serfs and right-click the mine or the deposit. Ore goes straight into your stockpile.</div>`;
        if (ent.kind === 'mine' || ent.kind === 'foundry') html += this.chainLine(ent);
        if (ent.kind === 'foundry') html += `<div class="hint">Smelts on its own from your stockpile: <b>iron + coal → steel</b> (forges turn it into arms), <b>copper + coal → fine ware</b> (content villages). Sell the surplus through a market's camels.</div>`;
        if (ent.kind === 'keep') html += this.buildGrid();
        if (!html) html = `<div class="hint">${esc(BUILDINGS[ent.kind].info)}</div>`;
        else if (Object.values(UNITS).some((u) => u.from.includes(ent.kind))) html += `<div class="hint">Right-click the field to set a <b>rally point</b>; on a resource, new serfs gather it.</div>`;
      }
    } else if (ent && ent.type === 'village') {
      html = this.villageActs(ent) + this.tradeBoard(ent) + `<div class="hint">${ent.owner === PLAYER ? 'Yours: right-click with soldiers to garrison. Select a keep and right-click it to <b>levy</b> villagers.' : 'Win it by <b>sack</b> (soldiers), <b>influence</b> (a keep with soldiers inside, plus a temple, tavern or market near it) or a <b>spy</b>. Independent villages also trade with your camels.'}</div>`;
    } else if (ent && ent.type === 'building') {
      const army = g.militaryOf(PLAYER).length;
      html = `<div class="ctitle">Options</div><div class="cgrid">${this.btn('sendarmyb', { glyph: '⚔', name: 'Attack', off: !army, sub: army ? `${army} soldiers` : '', tip: '<b>Attack</b><br>Sends every soldier at it. Or select units and right-click it (rams are best against walls).' })}</div>${ent.kind === 'market' ? this.tradeBoard(ent) : ''}<div class="hint">${esc(HOUSES[ent.team].name)} building. Select units and right-click it to attack.</div>`;
    } else if (s.type === 'node' && g.resources[s.id]) {
      const n = g.resources[s.id], mined = MINEABLE.includes(n.kind), hasMine = mined && g.buildings.some((b) => b.kind === 'mine' && b.hp > 0 && b.nodeIds?.includes(n.id));
      html = `<div class="ctitle">Options</div><div class="cgrid">${mined && !hasMine ? this.btn('minehere', { glyph: '⛏', art: 'mine', name: 'Build mine', sub: costShort(BUILDINGS.mine.cost), off: !g.canAfford(PLAYER, BUILDINGS.mine.cost), tip: `<b>Mine</b><br>Raised beside the deposit; then assign serfs. <span class="cost">${costText(BUILDINGS.mine.cost, g.players[PLAYER])}</span>` }) : ''}${!mined ? this.btn('gathernode', { glyph: '⚒', name: 'Gather', sub: '4 idle serfs', tip: '<b>Gather</b><br>Sends up to four idle serfs.' }) : ''}</div><div class="hint">${mined ? (hasMine ? 'A mine stands here: select it to send diggers.' : 'Ore needs a <b>Mine</b>. Once built, serfs dig it into your stockpile.') : 'Select serfs and right-click to gather.'}</div>`;
    } else {
      html = `<div class="hint">Press <b>H</b> for your home village: <b>draft serfs</b> and <b>raise buildings</b>. Right-click timber, berries or gold with serfs to gather. <b>M</b> opens the campaign map.</div>`;
    }
    if (html !== this.sigCmd) { this.sigCmd = html; $('cmdPanel').innerHTML = html; }
  }

  // ------------------------------------------------------------ screens: menu, campaign, end
  buildMenu() {
    const cfg = this.cfg;
    const seg = $('mHouses');
    const refreshSeg = () => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.n === cfg.houses));
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      cfg.houses = +b.dataset.n; refreshSeg();
      if (!this.started) this.onReroll?.({ seed: this.game.seed, houses: cfg.houses }); // pre-match: preview updates at once
      else this.toast(`${cfg.houses} houses from the next New Valley.`, 'info');
      this.refreshMenu();
    });
    const dseg = $('mDiff');
    const refreshDiff = () => dseg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.d === cfg.diff));
    dseg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      cfg.diff = b.dataset.d; refreshDiff();
      if (!this.started) this.onReroll?.({ seed: this.game.seed, houses: cfg.houses }); else this.toast(`${b.textContent} from the next New Valley.`, 'info');
    });
    refreshDiff();
    $('mBegin').onclick = () => this.closeMenu();
    $('mBack').onclick = () => this.showMain();
    $('hContinue').onclick = () => this.closeMenu();
    $('sbSave').onclick = () => this.saveGame('manual');
    $('sbLoad').onclick = () => this.loadGame('manual');
    $('sbAuto').onclick = () => this.loadGame('auto');
    window.addEventListener('visibilitychange', () => { if (document.hidden) { this.lastAuto = -999; this.autoSave(); } });
    window.addEventListener('pagehide', () => { this.lastAuto = -999; this.autoSave(); });
    this.refreshSaveBar();
    $('hNew').onclick = () => this.newValley();
    $('hMap').onclick = () => { this.closeMenu(true); this.toggleCampaign(); };
    $('hSkirmish').onclick = () => this.showSetup();
    $('hOptions').onclick = () => this.showSetup();
    $('hQuit').onclick = () => { $('quit').classList.remove('hidden'); };
    const splash = $('splash'), leave = () => { if (splash.classList.contains('gone')) return; splash.classList.add('gone'); setTimeout(() => splash.classList.add('hidden'), 650); $('mainmenu').classList.remove('hidden'); };
    splash.addEventListener('click', leave);
    window.addEventListener('keydown', () => { if (!splash.classList.contains('hidden')) leave(); }, true);
    if (new URLSearchParams(location.search).get('start') === '1') { splash.classList.add('hidden'); }
    $('mNew').onclick = () => this.newValley();
    $('mMap').onclick = () => { this.closeMenu(true); this.toggleCampaign(); };
    $('mQuit').onclick = () => { $('quit').classList.remove('hidden'); };
    $('mFog').onchange = (e) => { cfg.fog = e.target.checked; this.game.setFog(cfg.fog); this.mini.t = 0; };
    $('mSeedGo').onclick = () => { const v = parseInt($('mSeed').value, 10); if (v > 0) { this.onReroll?.({ seed: v, houses: cfg.houses }); this.started = false; this.refreshMenu(); } };
    refreshSeg();
  }
  refreshMenu() {
    const g = this.game;
    $('mSeed').value = g.seed; $('mSeedShow').textContent = g.seed;
    $('mBegin').textContent = this.started ? 'Resume the Valley' : 'Begin the Valley';
    $('mFog').checked = g.fogOn;
    $('mHouses').querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.n === this.cfg.houses));
    $('mDiff').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.d === this.cfg.diff));
    drawVale($('vale'), g, { fog: false });
    const box = $('crests'); box.innerHTML = '';
    for (let i = 0; i < MAX_HOUSES; i++) {
      const d = document.createElement('div'); d.className = 'crestcard' + (i < g.houses ? '' : ' off');
      d.innerHTML = `<canvas width="44" height="48"></canvas><b>${esc(HOUSES[i].short)}</b><i>${i === 0 ? 'You' : 'Rival'} · ${HOUSES[i].color}</i>`;
      box.appendChild(d); drawCrest(d.querySelector('canvas').getContext('2d'), 22, 24, 40, i);
    }
  }
  openMenu() { this.menuOpen = true; this.setPaused(false); this.refreshMenu(); this.showMain(); $('campaign').classList.add('hidden'); this.campaignOpen = false; }
  // ------------------------------------------------------------ save / load
  saveGame(slot = 'manual', quiet = false) {
    const g = this.game;
    if (!this.started || g.outcome) { if (!quiet) this.toast('There is no game in progress to save.', 'warn'); return false; }
    const ok = writeSave(slot, g.serialize());
    if (!quiet) this.toast(ok ? 'Game saved.' : 'Could not save: the browser refused storage (private window or full).', ok ? 'good' : 'warn');
    this.refreshSaveBar();
    return ok;
  }
  loadGame(slot = 'manual') {
    const d = readSave(slot);
    if (!d) { this.toast('No saved game there yet.', 'warn'); return false; }
    try { this.onLoad(d); } catch (e) { console.error('[auld-world] load failed', e); this.toast('That save could not be loaded: ' + e.message, 'warn'); return false; }
    this.started = true; this.firstFocus = true; this.closeMenu(); this.toast('Game loaded.', 'good');
    return true;
  }
  autoSave() {
    if (!this.started || this.game.outcome || this.menuOpen) return;
    if (this.game.time - (this.lastAuto ?? -999) < 90) return;
    this.lastAuto = this.game.time; this.saveGame('auto', true);
  }
  refreshSaveBar() {
    const bar = $('savebar'); if (!bar) return;
    const line = (slot, label) => { const i = saveInfo(slot); return i ? `${label}: ${i.minutes} min played, ${ago(i.saved)}` : `${label}: empty`; };
    $('sbInfo').textContent = line('manual', 'Saved game') + '  |  ' + line('auto', 'Autosave');
    $('sbSave').disabled = !this.started || !!this.game.outcome;
    $('sbLoad').disabled = !saveInfo('manual'); $('sbAuto').disabled = !saveInfo('auto');
  }
  showMain() { this.refreshSaveBar(); $('menu').classList.add('hidden'); $('mainmenu').classList.remove('hidden'); }
  showSetup() { $('mainmenu').classList.add('hidden'); $('menu').classList.remove('hidden'); this.refreshMenu(); }
  closeMenu(keepStarted) { this.menuOpen = false; this.started = true; $('menu').classList.add('hidden'); $('mainmenu').classList.add('hidden'); if (!this.firstFocus) { this.focusHall(); this.firstFocus = true; } }
  newValley() {
    const seed = $('mSeedLock').checked ? this.game.seed : undefined;
    this.onReroll?.({ seed, houses: this.cfg.houses });
    this.started = false; this.firstFocus = false; this.refreshMenu(); this.closeMenu();
    $('end').classList.add('hidden');
  }
  toggleCampaign() { this.campaignOpen ? this.closeCampaign() : this.openCampaign(); }
  openCampaign() { if (this.menuOpen && !this.started) return; this.campaignOpen = true; this.menuOpen = false; $('menu').classList.add('hidden'); $('mainmenu').classList.add('hidden'); $('campaign').classList.remove('hidden'); this.drawCampaign(); }
  closeCampaign() { this.campaignOpen = false; $('campaign').classList.add('hidden'); }
  drawCampaign() {
    const r = this.r;
    drawVale($('campaignCanvas'), this.game, { fog: true, poly: r.viewPoly(), labels: true });
  }
  showEnd() {
    this.endShown = true;
    const o = this.game.outcome;
    $('endTitle').textContent = o.result === 'victory' ? 'The valley is yours.' : 'Your house has fallen.';
    $('endText').textContent = o.reason + ` (${Math.floor(this.game.time / 60)} min ${Math.floor(this.game.time % 60)} s)`;
    $('end').classList.remove('hidden');
  }
}
