// Seven Holds - HUD, input, menu and campaign map. Talks to the host ONLY through host.send(intent).
import {
  TILE, PLAYER, HOUSES, UNITS, BUILDINGS, BUILD_ORDER_UI, RES, RES_LABEL, NODE_RES, VILLAGE_KINDS, VILLAGE_WIN_SHARE,
  VILLAGE_WIN_HOLD, MIN_HOUSES, MAX_HOUSES, RELATIONS,
} from './config.js';
import { drawCrest, drawVale } from './render.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ART_B = new Set(['hall','keep','cottage','farm','mill','warehouse','market','forge','workshop','tavern','academy','temple','barracks','archery','stable','tower']);
const ART_U = new Set(['serf','scout','footman','bowman','knight','spy','scholar']);
const artUrl = (kind) => ART_U.has(kind) ? `assets/ui/units/${kind}.png` : ART_B.has(kind) ? `assets/ui/buildings/${kind}.png` : null;
const icon = (kind, fallback) => { const u = artUrl(kind); return u ? `<img src="${u}" alt="" draggable="false">` : fallback; };
const portrait = (kind, accent) => artUrl(kind) ? `<img class="portrait" src="${artUrl(kind)}" alt="" draggable="false" style="border-color:${accent}">` : '';
const GLYPH = {
  cottage: '⌂', farm: '≋', mill: '✢', warehouse: '▣', market: '⚖', barracks: '⚔', archery: '➶', stable: '♞', tower: '♜',
  forge: '⚒', workshop: '⚙', tavern: '⚱', academy: '✎', temple: '✝', keep: '♚',
  serf: '♙', scout: '➤', footman: '♖', bowman: '➶', knight: '♞', spy: '◒', scholar: '✎', ram: 'Ram',
};
const costText = (cost, p) => RES.filter((r) => cost[r]).map((r) => `<span class="${p && p[r] < cost[r] ? 'need' : ''}">${cost[r]} ${RES_LABEL[r].toLowerCase()}</span>`).join(' · ') || 'free';

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
    this.hudT = 0; this.sigCmd = ''; this.sigSel = ''; this.tradeIdx = 0;
    this.toastSeen = 0;
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
    $('houses').addEventListener('click', (e) => { const b = e.target.closest('[data-house]'); if (b) this.cycleRelation(+b.dataset.house); });

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
      this.command(sx, sy, wx, wy); return;
    }
    if (e.button !== 0) return;
    if (this.placing) { this.tryPlace(e.shiftKey); return; }
    this.drag = { sx, sy, shift: e.shiftKey };
  }
  onMove(e) {
    const [sx, sy] = this.canvasPos(e);
    this.mouse.x = sx; this.mouse.y = sy;
    const [wx, wy] = this.r.toWorld(sx, sy);
    if (this.placing) { const s = BUILDINGS[this.placing].size; this.hoverTX = Math.round(wx - s / 2); this.hoverTY = Math.round(wy - s / 2); }
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
      const mine = g.units.filter((u) => u.team === PLAYER && u.hp > 0 && inBox(u, 14 * r.cam.zoom));
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
    const g = this.game, r = this.r, h = r.pick(sx, sy);
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
    if (h && h.type === 'building') { this.sel = { type: 'building', ids: [], id: h.o.id }; return; }
    if (h && h.type === 'village') { this.sel = { type: 'village', ids: [], id: h.o.id }; return; }
    if (h && h.type === 'node') { this.sel = { type: 'node', ids: [], id: h.o.id }; return; }
    if (!shift) this.clearSel();
  }
  command(sx, sy, wx, wy) {
    const g = this.game, units = this.selUnits().filter((u) => u.team === PLAYER);
    const h = this.r.pick(sx, sy), ho = h ? h.o : null;
    const eu = h && h.type === 'unit' ? ho : null, v = h && h.type === 'village' ? ho : null, b = h && h.type === 'building' ? ho : null, n = h && h.type === 'node' ? ho : null;
    if (ho) { wx = ho.x + (ho.type === 'node' ? 0.5 : 0); wy = ho.y + (ho.type === 'node' ? 0.5 : 0); } // act on the thing itself, not the ground behind its sprite
    let color = '#8fe08f';
    if ((eu && eu.team !== PLAYER) || (v && v.owner !== PLAYER) || (b && b.team !== PLAYER)) color = '#e0685a';
    else if (n) color = '#e2c15e';
    if (units.length) {
      this.host.send({ type: 'context', ids: units.map((u) => u.id), x: wx, y: wy });
      this.pings.push({ x: wx, y: wy, age: 0, color });
      return;
    }
    const sb = this.selEntity();
    if (sb && sb.type === 'building' && sb.team === PLAYER && Object.values(UNITS).some((s) => s.from.includes(sb.kind))) {
      this.host.send({ type: 'rally', buildingId: sb.id, x: wx, y: wy, nodeId: n ? n.id : null });
      this.pings.push({ x: wx, y: wy, age: 0, color: '#7ac1ff' });
      this.toast(n ? 'Rally point set on the resource: new serfs will gather.' : 'Rally point set.', 'info');
    }
  }
  tryPlace(keep) {
    const serfs = this.selUnits().filter((u) => u.kind === 'serf').map((u) => u.id);
    const res = this.host.send({ type: 'place', kind: this.placing, tx: this.hoverTX, ty: this.hoverTY, ids: serfs });
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
    if (this.menuOpen) { if (k === 'enter' && this.started) this.closeMenu(); return; }
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

  focusHall() { const s = this.game.seatOf(PLAYER); if (!s) return; this.r.centerOn(s.x, s.y); this.sel = { type: 'building', ids: [], id: s.id }; }
  selectIdleSerf() {
    const idle = this.game.units.filter((u) => u.team === PLAYER && u.kind === 'serf' && u.hp > 0 && u.task.type === 'idle');
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
      case 'partner': this.tradeIdx++; this.sigCmd = ''; break;
      case 'trade': {
        const b = this.selEntity(); if (!b) break;
        const partners = g.tradePartners(PLAYER); if (!partners.length) break;
        const p = partners[this.tradeIdx % partners.length];
        this.host.send({ type: 'trade', partner: { type: p.type, id: p.id }, give: d.give, get: d.get, amount: +d.amount });
        break;
      }
      case 'select': { const e = g.byId.get(+d.id); if (e) this.sel = e.type === 'unit' ? { type: 'units', ids: [e.id], id: null } : { type: e.type, ids: [], id: e.id }; break; }
      default: break;
    }
    this.sigCmd = this.sigSel = '';
  }
  cycleRelation(team) {
    const g = this.game; if (team === PLAYER || !g.alive(team)) return;
    const cur = g.rel[PLAYER][team];
    const next = RELATIONS[(RELATIONS.indexOf(cur) + 1) % RELATIONS.length];
    if (this.host.send({ type: 'relation', other: team, state: next })) this.toast(`${HOUSES[team].name}: ${next}.`, next === 'war' ? 'war' : 'info');
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
    if (this.hudT <= 0) { this.hudT = 0.12; this.renderTop(); this.renderSel(); this.renderCmd(); }
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

  renderTop() {
    const g = this.game, p = g.players[PLAYER];
    $('r-food').textContent = Math.floor(p.food); $('r-wood').textContent = Math.floor(p.wood); $('r-gold').textContent = Math.floor(p.gold);
    const used = g.popUsed(PLAYER), cap = g.popCap(PLAYER);
    $('r-pop').textContent = `${used}/${cap}`; $('r-popwrap').classList.toggle('low', used >= cap);
    const m = Math.floor(g.time / 60), s = Math.floor(g.time % 60);
    $('clock').textContent = `${m}:${String(s).padStart(2, '0')}`;
    const counts = new Array(g.houses).fill(0); for (const v of g.villages) if (v.owner >= 0) counts[v.owner]++;
    let html = '';
    for (let i = 0; i < g.houses; i++) {
      const pl = g.players[i], me = i === PLAYER, rel = me ? '' : g.rel[PLAYER][i];
      const tip = me ? `<b>${esc(pl.name)}</b><br>${esc(HOUSES[i].motto)}` : `<b>${esc(pl.name)}</b> · relation: ${rel}<br>Click to cycle peace → trade → war.<br><span class='info'>Trade needs a Market. Peace/trade may be refused for a minute after war.</span>`;
      html += `<div class="hchip ${me ? 'me' : ''} ${pl.alive ? '' : 'fallen'}" data-house="${i}" data-tip="${encodeURIComponent(tip)}"><canvas width="22" height="24" data-crest="${i}"></canvas><span>${esc(HOUSES[i].short)}</span>${me ? '' : `<span class="rel ${rel}">${rel}</span>`}<span class="vcount">${counts[i]}v</span></div>`;
    }
    if (html !== this.sigHouses) {
      this.sigHouses = html; $('houses').innerHTML = html;
      $('houses').querySelectorAll('canvas[data-crest]').forEach((c) => { const x = c.getContext('2d'); x.clearRect(0, 0, 22, 24); drawCrest(x, 11, 12, 20, +c.dataset.crest); });
    }
    const need = g.villageNeed ?? Math.ceil(g.villages.length * VILLAGE_WIN_SHARE);
    const lead = Math.max(...counts), hold = g.winHold;
    $('holdbar').innerHTML = hold.team >= 0 ? `<b>${esc(HOUSES[hold.team].short)}</b> holds ${counts[hold.team]}/${g.villages.length} villages: <b>${Math.max(0, Math.ceil(VILLAGE_WIN_HOLD - hold.t))}s</b> to win` : `Villages ${counts[PLAYER]}/${g.villages.length} · need ${need}${lead > counts[PLAYER] ? '' : ''}`;
    document.querySelectorAll('.res').forEach((el) => { const r = el.dataset.res; if (r) el.classList.toggle('low', p[r] < 20); });
  }

  taskText(u) {
    const t = u.task;
    switch (t.type) {
      case 'move': return 'Marching';
      case 'attack': return 'Attacking';
      case 'gather': { const n = this.game.resources[t.nodeId]; return n ? `Gathering ${RES_LABEL[NODE_RES[n.kind]].toLowerCase()}` : 'Gathering'; }
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
        <div class="selsub">Select your hall (<b>H</b>) to build and train. Drag to select units. Right-click to act.</div>`;
    } else if (s.type === 'units') {
      const us = this.selUnits();
      if (us.length === 1) {
        const u = us[0], st = UNITS[u.kind], mine = u.team === PLAYER;
        html = `${portrait(u.kind, HOUSES[u.team].accent)}<div class="seltitle">${st.label} <small style="color:${HOUSES[u.team].accent};font-size:12px">${esc(HOUSES[u.team].short)}</small></div><div class="selsub">${esc(st.info)}</div>
          <div class="stat"><label>Health</label><div class="meter"><i class="hp" style="width:${(u.hp / u.maxHp) * 100}%"></i></div><span class="v">${Math.ceil(u.hp)}/${u.maxHp}</span></div>
          <div class="stat"><label>Damage</label><span>${st.dmg}${st.range > 1.6 ? ' ranged' : ''}</span><label>Speed</label><span>${st.speed}</span></div>
          ${mine ? `<div class="stat"><label>Task</label><span>${this.taskText(u)}${u.carry && u.carry.amount > 0.5 ? ` · ${Math.floor(u.carry.amount)} ${u.carry.kind}` : ''}</span></div>` : ''}`;
      } else {
        const by = {}; us.forEach((u) => { by[u.kind] = (by[u.kind] || 0) + 1; });
        html = `<div class="seltitle">${us.length} units</div><div class="selsub">Click a type to narrow the selection. Ctrl+1..9 stores a group.</div><div class="chips">${Object.entries(by).map(([k, n]) => `<span class="chip x" data-act="kind" data-kind="${k}">${GLYPH[k]?.length === 1 ? GLYPH[k] : ''} ${UNITS[k].label} × ${n}</span>`).join('')}</div>`;
      }
    } else if (s.type === 'building') {
      const b = g.byId.get(s.id); if (!b) { this.clearSel(); return; }
      const st = BUILDINGS[b.kind], mine = b.team === PLAYER;
      html = `${portrait(b.kind, HOUSES[b.team].accent)}<div class="seltitle">${st.label} <small style="color:${HOUSES[b.team].accent};font-size:12px">${esc(HOUSES[b.team].short)}</small></div><div class="selsub">${esc(st.info)}</div>
        <div class="stat"><label>Health</label><div class="meter"><i class="hp" style="width:${(b.hp / b.maxHp) * 100}%"></i></div><span class="v">${Math.ceil(b.hp)}/${b.maxHp}</span></div>`;
      if (b.built < 1) html += `<div class="stat"><label>Building</label><div class="meter"><i class="prog" style="width:${b.built * 100}%"></i></div><span class="v">${Math.floor(b.built * 100)}%</span></div><div class="selsub">Right-click with serfs to help.</div>`;
      if (mine && b.built >= 1 && st.pop) html += `<div class="stat"><label>Population</label><span>+${st.pop}</span></div>`;
      if (mine && b.queue.length) {
        html += `<div class="qrow">${b.queue.map((q, i) => `<div class="qslot" data-act="cancel" data-i="${i}" data-tip="${encodeURIComponent(`<b>${UNITS[q.kind].label}</b><br>Click to cancel (refund).`)}">${GLYPH[q.kind].length === 1 ? GLYPH[q.kind] : 'R'}${i === 0 ? `<i style="width:${(q.t / UNITS[q.kind].time) * 100}%"></i>` : ''}</div>`).join('')}</div>`;
      }
      if (mine && b.kind === 'academy') html += `<div class="stat"><label>Scholars</label><span>${b.scholars || 0}/4 near: +${(b.scholars || 0) * 30}% influence</span></div>`;
    } else if (s.type === 'village') {
      const v = g.byId.get(s.id); if (!v) { this.clearSel(); return; }
      const k = VILLAGE_KINDS[v.kind], lord = v.owner >= 0 ? HOUSES[v.owner].name : 'Independent';
      const tr = k.tribute;
      html = `<div class="seltitle">${esc(v.name)} <small style="color:#cdbb8a;font-size:12px">${k.label}</small></div><div class="selsub">${esc(k.blurb)}</div>
        <div class="stat"><label>Lord</label><span>${esc(lord)}</span></div>
        <div class="stat"><label>Loyalty</label><div class="meter"><i class="loy" style="width:${v.loyalty}%"></i></div><span class="v">${v.loyalty | 0}</span></div>
        <div class="stat"><label>Protection</label><div class="meter"><i class="pro" style="width:${(v.protection / v.maxProtection) * 100}%"></i></div><span class="v">${v.protection | 0}/${v.maxProtection}</span></div>
        <div class="stat"><label>Folk</label><span>${v.folk.join(', ')}</span></div>`;
    } else if (s.type === 'node') {
      const n = g.resources[s.id]; if (!n) { this.clearSel(); return; }
      const res = NODE_RES[n.kind];
      html = `<div class="seltitle">${{ tree: 'Timber stand', gold: 'Gold seam', berry: 'Berry bushes' }[n.kind]}</div><div class="selsub">Right-click with serfs to gather ${RES_LABEL[res].toLowerCase()}.</div><div class="stat"><label>Remaining</label><span>${Math.ceil(n.amount)}</span></div>`;
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
    for (const kind of BUILD_ORDER_UI) {
      const s = BUILDINGS[kind];
      const miss = s.requires.filter((r) => !g.hasBuilding(PLAYER, r)).map((r) => BUILDINGS[r].label);
      const afford = g.canAfford(PLAYER, s.cost);
      const tip = `<b>${s.label}</b><br><span class="info">${esc(s.info)}</span><br><span class="cost">${costText(s.cost, p)}</span> · ${s.time}s${miss.length ? `<br><span class="need">Needs: ${miss.join(', ')}</span>` : ''}`;
      html += this.btn('place', { off: miss.length || !afford, glyph: GLYPH[kind], art: kind, name: s.label.replace('Watchtower', 'Tower').replace('Archery Range', 'Archery').replace('Timber ', ''), sub: Object.entries(s.cost).filter(([, v]) => v).map(([k, v]) => `${v}${k[0] === 'f' ? 'g' : k[0] === 'w' ? 't' : 'c'}`).join(' '), data: { kind }, tip });
    }
    return html + `</div>`;
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
      html += this.btn('train', { off: !afford || !room, glyph: GLYPH[k], art: k, name: s.label, sub: Object.entries(s.cost).filter(([, v]) => v).map(([kk, v]) => `${v}${kk[0] === 'f' ? 'g' : kk[0] === 'w' ? 't' : 'c'}`).join(' '), data: { kind: k }, tip });
    }
    return html + `</div>`;
  }
  tradePanel(b) {
    const g = this.game;
    const partners = g.tradePartners(PLAYER);
    if (!partners.length) return `<div class="ctitle">Market</div><div class="hint">No one to trade with. Set a house to <b>trade</b> in the top bar, or befriend a village (own it, or loyalty 40+).</div>`;
    const p = partners[this.tradeIdx % partners.length];
    const pairs = [['wood', 'gold'], ['food', 'gold'], ['gold', 'wood'], ['gold', 'food'], ['food', 'wood'], ['wood', 'food']];
    let html = `<div class="ctitle">Trade at the market</div><button class="cbtn wide" data-act="partner" data-tip="${encodeURIComponent('Click to cycle trade partner')}"><span class="n">Partner: ${esc(p.name)} (${p.type === 'house' ? 'house' : 'village'})</span></button><div class="trade">`;
    for (const [give, get] of pairs) {
      const amount = give === 'gold' ? 30 : 60;
      const q = g.tradeQuote(PLAYER, p, give, get, amount);
      html += `<button class="cbtn ${q && g.players[PLAYER][give] >= amount ? '' : 'off'}" data-act="trade" data-give="${give}" data-get="${get}" data-amount="${amount}" data-tip="${encodeURIComponent(`Fee ${q ? Math.round(q.fee * 100) : '?'}% (distance and relations)`)}"><span class="n">${amount} ${RES_LABEL[give].toLowerCase()}</span><span class="c">→ ${q ? q.got : 0} ${RES_LABEL[get].toLowerCase()}</span></button>`;
    }
    return html + `</div>`;
  }

  renderCmd() {
    const g = this.game, s = this.sel;
    let html = '';
    const us = this.selUnits().filter((u) => u.team === PLAYER);
    const ent = this.selEntity();
    if (s.type === 'units' && us.length) {
      if (us.some((u) => u.kind === 'serf')) html += this.buildGrid();
      html += `<div class="cgrid c4" style="margin-top:6px">${this.btn('stop', { glyph: '■', name: 'Stop', tip: '<b>Stop</b><br>Halt and hold position.', cls: '' })}</div>`;
      if (!us.some((u) => u.kind === 'serf')) {
        const sp = us.some((u) => u.kind === 'spy');
        html += `<div class="hint">Right-click: <b>move</b>, <b>attack</b> a foe, <b>sack</b> a village${sp ? ', or send the <b>spy</b> in to turn its loyalty' : ''}. Attacking a house at peace declares war.</div>`;
      }
    } else if (ent && ent.type === 'building' && ent.team === PLAYER) {
      if (ent.built < 1) html = `<div class="hint">Under construction. Select serfs and right-click this building to help raise it.</div>`;
      else {
        html += this.trainGrid(ent);
        if (ent.kind === 'market') html += this.tradePanel(ent);
        if (ent.kind === 'hall' || ent.kind === 'keep') html += this.buildGrid();
        if (!html) html = `<div class="hint">${esc(BUILDINGS[ent.kind].info)}</div>`;
        else if (Object.values(UNITS).some((u) => u.from.includes(ent.kind))) html += `<div class="hint">Right-click the field to set a <b>rally point</b>; on a resource, new serfs gather it.</div>`;
      }
    } else if (ent && ent.type === 'village') {
      html = `<div class="hint">Three ways to win a village:<br><b>Sack</b>: send soldiers (right-click) until protection hits zero.<br><b>Influence</b>: a nearby keep, temple, tavern or academy raises its loyalty.<br><b>Spy</b>: right-click with a spy from a tavern. Spies can be caught.</div>`;
    } else if (ent && ent.type === 'building') {
      html = `<div class="hint">${esc(HOUSES[ent.team].name)} building. Right-click with soldiers to attack (rams are best against walls).</div>`;
    } else {
      html = `<div class="hint">Press <b>H</b> for your hall. From the hall: <b>train serfs</b> and <b>raise buildings</b>. Right-click timber, berries or gold with serfs to gather. <b>M</b> opens the campaign map.</div>`;
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
    $('mBegin').onclick = () => this.closeMenu();
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
    drawVale($('vale'), g, { fog: false });
    const box = $('crests'); box.innerHTML = '';
    for (let i = 0; i < MAX_HOUSES; i++) {
      const d = document.createElement('div'); d.className = 'crestcard' + (i < g.houses ? '' : ' off');
      d.innerHTML = `<canvas width="44" height="48"></canvas><b>${esc(HOUSES[i].short)}</b><i>${i === 0 ? 'You' : 'Rival'} · ${HOUSES[i].color}</i>`;
      box.appendChild(d); drawCrest(d.querySelector('canvas').getContext('2d'), 22, 24, 40, i);
    }
  }
  openMenu() { this.menuOpen = true; this.setPaused(false); this.refreshMenu(); $('menu').classList.remove('hidden'); $('campaign').classList.add('hidden'); this.campaignOpen = false; }
  closeMenu(keepStarted) { this.menuOpen = false; this.started = true; $('menu').classList.add('hidden'); if (!this.firstFocus) { this.focusHall(); this.firstFocus = true; } }
  newValley() {
    const seed = $('mSeedLock').checked ? this.game.seed : undefined;
    this.onReroll?.({ seed, houses: this.cfg.houses });
    this.started = false; this.firstFocus = false; this.refreshMenu(); this.closeMenu();
    $('end').classList.add('hidden');
  }
  toggleCampaign() { this.campaignOpen ? this.closeCampaign() : this.openCampaign(); }
  openCampaign() { if (this.menuOpen && !this.started) return; this.campaignOpen = true; this.menuOpen = false; $('menu').classList.add('hidden'); $('campaign').classList.remove('hidden'); this.drawCampaign(); }
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
