// Auld World - HUD, input, menu and campaign map. Talks to the host ONLY through host.send(intent).
import { unlock, play, playAt, settings, setVolume, setMuted } from './audio.js';
import { progress } from './objectives.js';
import { writeSave, readSave, saveInfo, ago } from './save.js';
import { camelSprite, FIMG, SIMG, uiArt, RULER_ART } from './art.js';
import { gfx, setQuality } from './gfx.js';
import {
  TILE, MAP_SIZES, PLAYER, HOUSES, FACTIONS, UNITS, BUILDINGS, BUILD_ORDER_UI, RES, RES_LABEL, NODE_RES, VILLAGE_KINDS, VILLAGE_WIN_SHARE,
  VILLAGE_WIN_HOLD, WEALTH_HOLD, LAND_LOYALTY, BUILDERS, MIN_HOUSES, MAX_HOUSES, RELATIONS, MATS, MINEABLE, CAMEL_CAP, ROUTE_STOPS, WAREHOUSE_CAP, DISTRICT, LINKS, SPY_FEE, STANCES, STANCE, FORMATIONS, FORMATION, DRAFT, WAGE_FREE, INCOME_SOURCES, TAX, SHELF_CAP, MARKET_RADIUS, ALL_GOODS, GOOD_LABEL, GOOD_COLOR, GOOD_INFO, RES_VALUE, MINE_MAX_WORKERS, MINE_JOBS, RANKS, RANK_BONUS, SCIENCE, ARMS_STEEL, SCI_SILVER, SMELT, GARRISON, DRILL, TRAITS, ABILITIES, LEVY, VILLAGE_GARRISON, POP_HOUSING, SETTLE_FOOD, FARLANDS, DEEDS, CAPTAIN, TEMPERS, TECH, TECH_KEYS, GEAR, GEAR_KEYS, CRAFT_QUEUE, packWords, packOf, SIEGE_STORE, PEACE_COIN, BELL, KEEP_ARROWS } from './config.js';
import { drawCrest, drawVale } from './render.js';
import { intel, ranking, DIPLO } from './diplomacy.js';
import { groupUnits, groupRow, cleanGroups } from './groups.js';
import { KEY_ACTIONS, loadKeys, saveKeys, rebind, actionOf, keyName, normKey, defaultKeys, GRID_KEYS, gridLabel, gridSlotOf, assignGrid, loadGrid, saveGrid, fillKeys } from './keys.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ART_B = new Set(['keep','cottage','farm','mill','warehouse','market','forge','workshop','tavern','academy','temple','barracks','archery','stable','tower','mine','foundry']);
const ART_U = new Set(['recruit','serf','scout','footman','bowman','knight','spy','scholar']);
const artUrl = (kind0, team = PLAYER, kind = kind0 === 'king' ? 'knight' : kind0) => kind === 'village' ? 'assets/shared/villages/1tile/hamlet.png' : FIMG[HOUSES[team].faction]?.[kind] ? FIMG[HOUSES[team].faction][kind].src : kind === 'camel' ? (SIMG.dromedary?.src || camelURL()) : SIMG[kind] && (kind === 'ram' || kind === 'onager' || kind === 'trebuchet') ? SIMG[kind].src :   // (the painted engines stand in for a card)
   ART_U.has(kind) ? `assets/ui/units/${kind}.png` : ART_B.has(kind) ? `assets/ui/buildings/${kind}.png` : null;
let _camel = null;
function camelURL() { try { return (_camel ||= camelSprite(0).toDataURL()); } catch { return null; } }
const icon = (kind, fallback) => { const u = artUrl(kind); return u ? `<img src="${u}" alt="" draggable="false">` : fallback; };
const portrait = (kind, accent, team = PLAYER, src = artUrl(kind, team)) => src ? `<img class="portrait" src="${src}" alt="" draggable="false" style="border-color:${accent}">` : '';
// painted UI art (kit, research, marks, portraits) as an inline <img>, or the fallback text while the file is missing
const uiImg = (group, key, fallback = '', cls = 'ico') => { const u = uiArt(group, key); return u ? `<img class="${cls}" src="${u}" alt="" draggable="false">` : fallback; };
// the face for a person: a far-lander's own portrait, a ruler's portrait for a king, else the unit art
const faceOf = (u) => (u.far && uiArt('portraits', u.far)) || (u.kind === 'king' && uiArt('portraits', RULER_ART[HOUSES[u.team]?.faction])) || null;
const GLYPH = {
  cottage: '⌂', farm: '≋', mill: '✢', warehouse: '▣', market: '⚖', barracks: '⚔', archery: '➶', stable: '♞', tower: '♜',
  mine: '⛏', foundry: '♨', forge: '⚒', workshop: '⚙', tavern: '⚱', academy: '✎', temple: '✝', keep: '♚', armoury: '⛨',
  recruit: '☗', serf: '♙', scout: '➤', footman: '♖', bowman: '➶', knight: '♞', king: '♔', spy: '◒', camel: '🐪', scholar: '✎', ram: 'Ram', onager: '☄', trebuchet: '⚖',
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
    let store = null; try { store = localStorage; } catch { store = null; }
    this.keyStore = store; this.kmap = loadKeys(store); this.rebinding = null;   // the key map (T03), rebound in Options > Keys
    this.gridKeys = loadGrid(store); this.gridMap = [];   // Grid keys (T03, AoE IV layout): the command card's buttons by place, Options > Keys
    this.speed = 1; this.paused = false; this.started = false;
    this.menuOpen = true; this.campaignOpen = false; this.endShown = false;
    this.lastClick = { t: 0, id: null };
    this.want = null; this.hudT = 0; this.sigCmd = ''; this.sigSel = ''; this.tradeIdx = 0;
    this.toastSeen = 0;
    const off = document.createElement('div'); off.id = 'offers'; $('field').appendChild(off);
    off.addEventListener('click', (e) => { const b = e.target.closest('button[data-act]'); if (b) this.onCmd({ ...b.dataset }); });
    // panels are rebuilt several times a second; a rebuild between press and release would lose the click, so they hold still while a button is down
    document.addEventListener('pointerdown', (e) => { if (e.button === 0 && e.target.closest?.('#offers, #cmdPanel, #selPanel, #council, #diplo, #houses, #topbar, #groupBar')) this.uiHold = true; }, true);
    document.addEventListener('pointerup', () => { this.uiHold = false; }, true); window.addEventListener('blur', () => { this.uiHold = false; });
    this.bind();
    this.buildMenu();
  }
  setGame(game) { this.game = game; this.heard = null; this.mini.setGame(game); this.clearSel(); this.placing = null; this.endShown = false; this.sigCmd = this.sigSel = this.sigGroups = ''; this.groups = {}; this.lastGroup = null; this.lastAuto = game.time; $('end').classList.add('hidden'); }   // (a new or loaded match keeps no old groups: their ids would name other men; nor the old autosave clock)

  // ------------------------------------------------------------ selection helpers
  isSelected(e) {
    const s = this.sel;
    if (e.type === 'unit') return s.type === 'units' && s.ids.includes(e.id);
    return (s.type === 'building' || s.type === 'village') && s.id === e.id;
  }
  clearSel() { this.sel = { type: 'none', ids: [], id: null }; }
  // control groups (Ctrl+1-9 sets, 1-9 recalls, again centres); shown as a row over the minimap (T36)
  setGroup(k) { const us = this.selUnits().filter((u) => u.team === PLAYER); if (!us.length) return; this.groups[k] = us.map((u) => u.id); this.toast(`Group ${k} set (${us.length}).`, 'info'); this.renderGroups(); }
  recallGroup(k, centre) { const us = groupUnits(this.game, this.groups[k]); if (!us.length) return; this.setUnits(us); if (centre) this.r.centerOn(us[0].x, us[0].y); this.lastGroup = k; }
  renderGroups() {
    const row = groupRow(this.game, this.groups), el = $('groupBar'); if (!el) return;
    const sig = row.map((c) => `${c.k}${c.n}${c.kind}${c.fighting ? '!' : ''}`).join() + (this.sel.type === 'units' ? '|' + this.lastGroup : '');
    if (sig === this.sigGroups) return; this.sigGroups = sig;
    el.classList.toggle('hidden', !row.length);
    el.innerHTML = row.map((c) => `<button class="grp${c.fighting ? ' fight' : ''}${this.lastGroup === c.k && this.sel.type === 'units' ? ' on' : ''}" data-grp="${c.k}" data-tip="${encodeURIComponent(`<b>Group ${c.k}</b>: ${c.n} ${c.n === 1 ? UNITS[c.kind].label : 'men, most of them ' + UNITS[c.kind].label.toLowerCase() + 's'}${c.fighting ? '. <b>In a fight now.</b>' : ''}<br>Click or press ${c.k} to select; double-click or press it again to go there. Ctrl+${c.k} stores the selection here.`)}"><b>${c.k}</b><span class="gi">${icon(c.kind, GLYPH[c.kind] || '')}</span><i>${c.n}</i></button>`).join('');
  }
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
    window.addEventListener('keyup', (e) => this.keys.delete(normKey(e.key)));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('resize', () => { this.r.resize(); this.r.clampCam(); });

    const mm = $('minimap');
    mm.addEventListener('contextmenu', (e) => e.preventDefault());
    const mmPos = (e) => { const b = mm.getBoundingClientRect(); return [((e.clientX - b.left) / b.width) * this.game.W, ((e.clientY - b.top) / b.height) * this.game.H]; };
    mm.addEventListener('mousedown', (e) => {
      const [x, y] = mmPos(e);
      if (e.button === 2) { this.command(null, null, x, y, e.shiftKey, e.ctrlKey); return; }
      this.r.centerOn(x, y); this.mmDrag = true;
    });
    window.addEventListener('mousemove', (e) => { if (this.mmDrag) { const [x, y] = mmPos(e); this.r.centerOn(Math.max(0, Math.min(this.game.W, x)), Math.max(0, Math.min(this.game.H, y))); } });
    window.addEventListener('mouseup', () => { this.mmDrag = false; });

    $('btnMenu').onclick = () => this.openMenu();
    $('btnMap').onclick = () => this.toggleCampaign();
    $('btnHome').onclick = () => this.focusHall();
    $('btnIdle').onclick = () => this.selectIdleSerf();
    $('btnArmy').onclick = (e) => (e.shiftKey ? this.selectIdleArmy() : this.selectArmy());
    if ($('btnBell')) $('btnBell').onclick = () => this.ringBell();
    $('groupBar').addEventListener('click', (e) => { const b = e.target.closest('[data-grp]'); if (b) this.recallGroup(b.dataset.grp, false); });
    $('groupBar').addEventListener('dblclick', (e) => { const b = e.target.closest('[data-grp]'); if (b) this.recallGroup(b.dataset.grp, true); });
    $('btnSpeed').onclick = () => { this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1; $('btnSpeed').textContent = this.speed + 'x'; };
    $('eNew').onclick = () => this.newValley();
    $('eStay').onclick = () => $('end').classList.add('hidden');

    const cmd = $('cmdPanel');
    cmd.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) this.onCmd(b.dataset); });
    $('selPanel').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) this.onCmd(b.dataset); });
    $('houses').addEventListener('click', (e) => { const b = e.target.closest('[data-house]'); if (b) this.toggleDiplo(+b.dataset.house); });
    $('council').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) this.onCmd({ ...b.dataset }); });
    $('btnCouncil').onclick = () => this.toggleCouncil();
    $('diplo').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) this.onCmd({ ...b.dataset }); });

    // tooltips
    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest('[data-tip]'); const tip = $('tip');
      if (!el) { tip.classList.add('hidden'); return; }
      tip.innerHTML = packWords(decodeURIComponent(el.dataset.tip), PLAYER); tip.classList.remove('hidden'); this.placeTip(e);
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
      if (this.amove) { this.setAmove(false); return; }
      if (this.patrolArm) { this.setPatrol(false); return; }
      this.command(sx, sy, wx, wy, e.shiftKey, e.ctrlKey); return;
    }
    if (e.button !== 0) return;
    if (this.placing) { this.tryPlace(e.shiftKey); return; }
    if (this.amove) { if (!e.shiftKey) this.setAmove(false); this.command(sx, sy, wx, wy, e.shiftKey, true); return; }   // Shift keeps attack-move on to queue more legs
    if (this.patrolArm) { if (!e.shiftKey) this.setPatrol(false); this.patrolTo(wx, wy, e.shiftKey); return; }   // Shift keeps patrol on to add more posts (T39)
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
    // a deposit names itself under the cursor: stone, iron and coal look alike at play zoom, and a mine raised on the wrong one costs minutes (playtest 2026-10-14)
    { const h = this.drag || e.target !== this.r.canvas ? null : this.r.pick(sx, sy), n = h && h.type === 'node' && MINEABLE.includes(h.o.kind) ? h.o : null, tip = $('tip');
      if (n) { tip.innerHTML = `<b>${n.kind === 'gold' ? 'Gold' : GOOD_LABEL[n.kind]} deposit</b><br>${Math.round(n.amount)} left · ${n.covered ? 'being mined' : n.kind === 'gold' ? 'serfs can pan it, or raise a Mine on it' : 'raise a Mine on it'}`; tip.classList.remove('hidden'); this.placeTip(e); this.nodeTip = true; }
      else if (this.nodeTip) { this.nodeTip = false; tip.classList.add('hidden'); } }
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
    this.clickAt(d.sx, d.sy, d.shift, e.ctrlKey || e.metaKey);
  }
  clickAt(sx, sy, shift, ctrl = false) {
    const g = this.game, r = this.r, h = r.pick(sx, sy, ['unit']) || r.pick(sx, sy);   // a person under the cursor wins over the building or village behind them
    if (h && h.type === 'unit') {
      const u = h.o, now = performance.now();
      if (u.team === PLAYER) {
        if (this.lastClick.id === u.id && now - this.lastClick.t < 350) {   // double-click: that kind on screen; with Ctrl, across the whole valley (T31)
          this.setUnits(g.units.filter((o) => o.team === PLAYER && o.kind === u.kind && o.hp > 0 && !o.inside && (ctrl || r.onScreen(o.x, o.y))));
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
  // Attack-move is armed by F or the button; the next left-click (or Ctrl+right-click at any time) fights its way to the spot
  setAmove(on) { this.amove = !!on; if (on) this.patrolArm = false; $('game').classList.toggle('placing', this.amove || this.patrolArm || !!this.placing); }
  // Patrol (T39) is armed by its key or button; the next left-click sets the far post (Shift-clicks add more posts to the round)
  setPatrol(on) { this.patrolArm = !!on; if (on) this.amove = false; $('game').classList.toggle('placing', this.amove || this.patrolArm || !!this.placing); }
  patrolTo(wx, wy, shift) {
    const units = this.selUnits().filter((u) => u.team === PLAYER && this.game.fighter(u));
    if (!units.length) return;
    this.host.send({ type: 'patrol', ids: units.map((u) => u.id), x: wx, y: wy, queue: shift });
    this.pings.push({ x: wx, y: wy, age: 0, color: '#f0c45c' });
  }
  command(sx, sy, wx, wy, shift = false, fight = false) {
    const g = this.game, units = this.selUnits().filter((u) => u.team === PLAYER);
    const h = sx == null ? null : this.r.pick(sx, sy), ho = h ? h.o : null;   // the minimap gives world coordinates only
    const eu = h && h.type === 'unit' ? ho : null, v = h && h.type === 'village' ? ho : null, b = h && h.type === 'building' ? ho : null, n = h && h.type === 'node' ? ho : null;
    if (ho) { wx = ho.x + (ho.type === 'node' ? 0.5 : 0); wy = ho.y + (ho.type === 'node' ? 0.5 : 0); } // act on the thing itself, not the ground behind its sprite
    let color = '#8fe08f';
    if ((eu && eu.team !== PLAYER) || (v && v.owner !== PLAYER) || (b && b.team !== PLAYER)) color = '#e0685a';
    else if (n) color = '#e2c15e';
    if (units.length && fight && !(eu && eu.team !== PLAYER) && !(v && v.owner !== PLAYER) && !(b && b.team !== PLAYER)) {
      this.host.send({ type: 'amove', ids: units.map((u) => u.id), x: wx, y: wy, queue: shift });
      this.pings.push({ x: wx, y: wy, age: 0, color: '#e0685a' });
      return;
    }
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
    if (this.rebinding) { e.preventDefault(); return this.takeRebind(k); }   // (Options > Keys: the next key pressed is the new one; Esc cancels)
    if (k === 'escape') { if (this.amove) return this.setAmove(false); if (this.patrolArm) return this.setPatrol(false); return this.onEsc(); }
    if (k === 'f5') { e.preventDefault(); return void this.saveGame('manual'); }
    if (k === 'f9') { e.preventDefault(); return void this.loadGame('manual'); }
    if (this.menuOpen) { if (k === 'enter' && this.started) this.closeMenu(); return; }
    // Grid keys: a key whose place on the command card holds a button presses it, ahead of the key map (with nothing there, the map still has it)
    if (this.gridKeys && !this.campaignOpen && !(e.ctrlKey || e.metaKey || e.altKey)) { const b = this.gridBtn(gridSlotOf(k, e.shiftKey)); if (b) { e.preventDefault(); if (!e.repeat) b.click(); return; } }
    // every other command goes through the key map (T03: rebindable in Options); Tab and Home stay as fixed extras
    const mod = e.ctrlKey || e.metaKey, act = k === 'tab' ? 'campaign' : k === 'home' ? 'alert' : mod ? null : actionOf(this.kmap, k);
    if (act === 'council') { this.toggleCouncil(); return; }
    if (act === 'standings') { this.showStand = !this.showStand; $('standings').classList.toggle('hidden', !this.showStand); return; }
    if (act === 'campaign') { e.preventDefault(); return this.toggleCampaign(); }
    if (this.campaignOpen) return;
    this.keys.add(normKey(k));
    if (e.repeat) return;
    const fighters = () => this.selUnits().some((u) => u.team === PLAYER && this.game.fighter(u));
    if (/^[1-9]$/.test(k)) {
      if (mod) { e.preventDefault(); this.setGroup(k); }
      else this.recallGroup(k, this.lastGroup === k);
      return;
    }
    switch (act) {
      case 'econ': this.showEcon = !this.showEcon; break;
      case 'hall': this.focusHall(); break;
      case 'king': this.selectKing(); break;
      case 'pause': this.setPaused(!this.paused); break;
      case 'alert': e.preventDefault(); this.jumpToAlert(); break;
      case 'idleSerf': this.selectIdleSerf(); break;
      case 'army': this.selectArmy(); break;
      case 'idleArmy': this.selectIdleArmy(); break;
      case 'bell': this.ringBell(); break;
      case 'charge': if (fighters()) this.onCmd({ act: 'charge' }); break;
      case 'retreat': if (this.selUnits().some((u) => u.team === PLAYER && (this.game.fighter(u) || u.kind === 'king'))) this.onCmd({ act: 'retreat' }); break;
      case 'amove': if (fighters()) this.setAmove(!this.amove); break;
      case 'patrol': if (fighters()) this.setPatrol(!this.patrolArm); break;
      case 'stop': if (this.selUnits().some((u) => u.team === PLAYER)) this.onCmd({ act: 'stop' }); break;
      case 'faster': this.speed = Math.min(4, this.speed * 2); $('btnSpeed').textContent = this.speed + 'x'; break;
      case 'slower': this.speed = Math.max(1, this.speed / 2); $('btnSpeed').textContent = this.speed + 'x'; break;
      default: break;   // (the pan keys are read each frame from this.keys)
    }
  }
  // the key map changed: redraw the Options list and every label that names a key
  applyKeys() {
    const kn = (id) => keyName(this.kmap[id]);
    this.renderKeys(); this.sigCmd = ''; this.sigSel = '';
    if ($('btnHome')) $('btnHome').title = `Jump to your home village (${kn('hall')})`;
    if ($('btnIdle')) $('btnIdle').title = `Select next idle serf (${kn('idleSerf')})`;
    if ($('btnArmy')) $('btnArmy').title = `Select all soldiers (${kn('army')}); Shift-click or ${kn('idleArmy')}: only the idle ones`;
    if ($('btnCouncil')) $('btnCouncil').title = `The Council of Houses: stats, treaties, letters (${kn('council')})`;
    if ($('btnMap')) $('btnMap').title = `Campaign map (${kn('campaign')} / Tab)`;
    if ($('btnSpeed')) $('btnSpeed').title = `Game speed (${kn('slower')} slower, ${kn('faster')} faster)`;
    if ($('btnBell')) $('btnBell').title = `Town bell (${kn('bell')}): your serfs run into the nearest keep, tower, barracks or village; ring again to send them back to work`;
    this.sigCmd = ''; if ($('kGrid')) $('kGrid').checked = this.gridKeys;
    if ($('mKeysHint')) $('mKeysHint').textContent = `Right-click to move, gather, sack, infiltrate. Drag to select. ${this.gridKeys ? 'The arrows pan (Grid keys are on: the command card answers to Q W E R / A S D F / Z X C V).' : `${['panUp', 'panLeft', 'panDown', 'panRight'].map(kn).join('')} or the arrows pan.`} ${kn('campaign')} opens the campaign map. ${kn('alert')} jumps to where you are under attack. Esc returns here.`;
  }
  renderKeys() {
    const g = $('keyGrid'); if (!g || g.classList.contains('hidden')) return;
    let html = '', grp = '';
    for (const a of KEY_ACTIONS) {
      if (a.group !== grp) { grp = a.group; html += `<div class="kgrp">${esc(grp)}</div>`; }
      const on = this.rebinding === a.id;
      html += `<div class="krow"><span>${esc(a.label)}</span><button class="small${on ? ' on' : ''}${this.kmap[a.id] !== a.def ? ' moved' : ''}" data-key="${a.id}">${on ? 'Press a key…' : esc(keyName(this.kmap[a.id]))}</button></div>`;
    }
    g.innerHTML = html + `<div class="tiny">Click a command, then press its new key (Esc cancels). A key already in use swaps over. Fixed: Esc, F5/F9, Tab, 1-9, the arrows, Home.</div>`;
  }
  takeRebind(k) {
    const id = this.rebinding; this.rebinding = null;
    if (k === 'escape') return this.renderKeys();
    const label = (x) => KEY_ACTIONS.find((a) => a.id === x)?.label;
    const r = rebind(this.kmap, id, k);
    if (!r.ok) { this.toast(r.why, 'warn'); return this.renderKeys(); }
    if (!saveKeys(this.keyStore, this.kmap)) this.toast('Could not remember the keys in this browser; they last until you close the tab.', 'warn');
    this.applyKeys();
    this.toast(`${label(id)}: ${keyName(this.kmap[id])}${r.swapped ? ` (${label(r.swapped)} moves to ${keyName(this.kmap[r.swapped])})` : ''}.`, 'info');
  }
  onEsc() {
    if (this.councilOpen) { this.councilOpen = false; $('council').classList.add('hidden'); return; }
    if (this.placing) { this.placing = null; $('game').classList.remove('placing'); return; }
    if (this.campaignOpen) return this.closeCampaign();
    if (this.menuOpen) { if (this.started) this.closeMenu(); return; }
    if (this.sel.type !== 'none' && false) return this.clearSel();
    this.openMenu();
  }
  setPaused(p) { this.paused = p; $('pausedBanner').classList.toggle('hidden', !p); }

  focusHall() { const s = this.game.seatOf(PLAYER); if (!s) return; this.r.centerOn(s.x, s.y); this.sel = { type: s.type === 'village' ? 'village' : 'building', ids: [], id: s.id }; }
  selectKing() {
    const k = this.game.kingOf(PLAYER);
    if (!k) { const p = this.game.players[PLAYER]; return this.toast(p.heirAt != null ? `Your heir takes the crown in ${Math.max(0, Math.ceil(p.heirAt - this.game.time))}s.` : 'You have no king.', 'warn'); }
    const b = k.inside != null ? this.game.byId.get(k.inside) : null;
    if (b) { this.r.centerOn(b.x, b.y); this.sel = { type: b.type, ids: [], id: b.id }; return; }
    this.setUnits([k]); this.r.centerOn(k.x, k.y);
  }
  // Space or Home: to where we were last hit (the red rings on the minimap), newest first, then the next one on a second press
  jumpToAlert() {
    const al = (this.game.alerts || []).filter((a) => this.game.time - a.time < 10).sort((a, b) => b.time - a.time);
    if (!al.length) return this.toast('Nothing of yours is under attack.', 'info');
    this.alertI = this.game.time - (this.alertAt ?? -99) < 3 ? ((this.alertI ?? 0) + 1) % al.length : 0; this.alertAt = this.game.time;
    const a = al[this.alertI]; this.r.centerOn(a.x, a.y); this.pings.push({ x: a.x, y: a.y, age: 0, color: '#ff4a3a' });
  }
  selectIdleSerf() {
    const idle = this.game.units.filter((u) => u.team === PLAYER && u.kind === 'serf' && u.hp > 0 && !u.inside && u.task.type === 'idle');
    if (!idle.length) return this.toast('No idle serfs.', 'info');
    this.idleI = ((this.idleI ?? -1) + 1) % idle.length;
    const u = idle[this.idleI]; this.setUnits([u]); this.r.centerOn(u.x, u.y);
  }
  // I (or Shift-click Army): every soldier standing idle, then the camera on the next of them at each press (T31)
  selectIdleArmy() {
    const idle = this.game.idleArmyOf(PLAYER);
    if (!idle.length) return this.toast('No idle soldiers.', 'info');
    this.setUnits(idle);
    this.idleArmyI = ((this.idleArmyI ?? -1) + 1) % idle.length; const u = idle[this.idleArmyI]; this.r.centerOn(u.x, u.y);
  }
  // a village of ours: the spies we posted there as watchmen, and whether someone has lately been turning its folk (T-058: both were unseen)
  watchRow(v) {
    const g = this.game, n = g.watchmenIn(v), at = g.players[PLAYER].spied?.[v.id], hot = at != null && g.time - at < 20;
    const tip = encodeURIComponent(`<b>Watch</b><br>A spy right-clicked onto a village you hold is posted inside as a watchman. Each one makes a rival spy at work there far likelier to be caught.`);
    return `<div class="stat" data-tip="${tip}"><label>${uiImg('marks', 'watch', '👁')} Watch</label><span>${n ? `${n} watchm${n > 1 ? 'en' : 'an'} posted` : 'none: right-click a spy onto it'}${hot ? ' · <b style="color:#ff9a7a">someone is at work here</b>' : ''}</span></div>`;
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
        const miss = g.missingFor(PLAYER, d.kind)[0];
        if (miss) return this.toast(`${s.label} needs a ${miss}.`, 'warn');
        if (!g.canAfford(PLAYER, s.cost)) return this.toast(g.shortfall(PLAYER, s.cost), 'warn');
        this.placing = d.kind; $('game').classList.add('placing');
        const [wx, wy] = this.r.toWorld(this.mouse.x, this.mouse.y); this.hoverTX = Math.round(wx - s.size / 2); this.hoverTY = Math.round(wy - s.size / 2);
        break;
      }
      case 'train': { const b = this.selEntity(); if (b) this.host.send({ type: 'train', buildingId: b.id, kind: d.kind }); break; }
      case 'cancel': { const b = this.selEntity(); if (b) this.host.send({ type: 'cancel', buildingId: b.id, index: +d.i }); break; }
      case 'stop': this.host.send({ type: 'stop', ids: this.selUnits().map((u) => u.id) }); break;
      case 'amove': this.setAmove(!this.amove); break;
      case 'patrol': this.setPatrol(!this.patrolArm); break;
      case 'disguise': this.host.send({ type: 'disguise', ids: this.selUnits().filter((u) => u.team === PLAYER && u.kind === 'spy').map((u) => u.id), as: +d.as }); break;
      case 'charge': this.host.send({ type: 'charge', ids: this.selUnits().filter((u) => u.team === PLAYER).map((u) => u.id) }); break;
      case 'retreat': this.host.send({ type: 'retreat', ids: this.selUnits().filter((u) => u.team === PLAYER).map((u) => u.id) }); break;
      case 'stance': this.host.send({ type: 'stance', ids: this.selUnits().filter((u) => u.team === PLAYER).map((u) => u.id), stance: d.stance }); break;
      case 'formation': this.host.send({ type: 'formation', ids: this.selUnits().filter((u) => u.team === PLAYER).map((u) => u.id), form: d.form }); break;
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
      case 'routeauto': {
        const ids = this.selUnits().filter((x) => x.kind === 'camel').map((x) => x.id);
        if (ids.length && !this.host.send({ type: 'routeauto', ids, mode: d.mode })) this.toast(g.diploNote || 'No loop is possible yet.', 'warn');
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
      case 'keephere': { const v = this.selEntity(); if (!v) break; if (!g.canAfford(PLAYER, BUILDINGS.keep.cost)) return this.toast(g.shortfall(PLAYER, BUILDINGS.keep.cost, ' for a keep'), 'warn'); this.placing = 'keep'; $('game').classList.add('placing'); this.hoverTX = Math.round(v.x) - 8; this.hoverTY = Math.round(v.y) - 2; break; }
      case 'sendarmyb': { const b = this.selEntity(); const a = g.militaryOf(PLAYER).map((u) => u.id); if (b && a.length) this.host.send({ type: 'attack', ids: a, targetId: b.id }); break; }
      case 'minehere': { const n = this.sel.type === 'node' ? g.resources[this.sel.id] : null; if (n) { this.placing = 'mine'; $('game').classList.add('placing'); this.hoverTX = Math.round(n.x - 1); this.hoverTY = Math.round(n.y - 1); } break; }
      case 'gathernode': { const n = this.sel.type === 'node' ? g.resources[this.sel.id] : null; if (!n) break; const serfs = g.units.filter((u) => u.team === PLAYER && u.kind === 'serf' && u.hp > 0 && u.task.type === 'idle').sort((a, c) => Math.hypot(a.x - n.x, a.y - n.y) - Math.hypot(c.x - n.x, c.y - n.y)).slice(0, 4); if (!serfs.length) this.toast('No idle serfs.', 'warn'); else this.host.send({ type: 'gather', ids: serfs.map((u) => u.id), nodeId: n.id }); break; }
      case 'treaty': this.treaty(+d.team, d.state, +d.coin || 0); break;
      case 'diploclose': this.diploOpen = null; this.renderDiplo(); break;
      case 'respond': { const r = this.host.send({ type: 'respond', from: +d.team, accept: d.accept === '1', id: d.id != null ? +d.id : null }); if (!r && d.accept === '1' && g.diploNote) this.toast(g.diploNote, 'warn'); this.sigOffers = null; this.sigCouncil = null; this.hudT = 0; break; }   // (null, not '': with no offers left the new html is '' and would look unchanged, leaving the answered card on screen)
      case 'gift': this.ask('gift', +d.team, { amount: +d.amount }); break;
      case 'demand': this.ask('demand', +d.team, { amount: +d.amount }); break;
      case 'askaid': this.ask('askaid', +d.team, { amount: +d.amount }); break;
      case 'askwar': this.ask('askwar', +d.team, { target: +d.target }); break;
      case 'council': this.toggleCouncil(d.team != null ? +d.team : null); break;
      case 'councilclose': this.councilOpen = false; $('council').classList.add('hidden'); break;
      case 'hire': { const b = this.selEntity(); if (b) this.host.send({ type: 'hire', buildingId: b.id, index: +d.i }); break; }
      case 'leave': { const b = this.selEntity(); if (b) this.host.send({ type: 'leave', buildingId: b.id }); break; }
      case 'bell': this.ringBell(); break;
      case 'gsel': this.gsel = +d.id; break;
      case 'research': this.host.send({ type: 'research', tech: d.tech }); break;
      case 'craft': { const b = this.selEntity(); if (b) this.host.send({ type: 'craft', buildingId: b.id, item: d.item }); break; }
      case 'uncraft': { const b = this.selEntity(); if (b) this.host.send({ type: 'uncraft', buildingId: b.id, index: +d.i }); break; }
      case 'repair': { const b = this.selEntity(); if (b) this.host.send({ type: 'repair', buildingId: b.id }); break; }
      case 'demolish': {   // two clicks: the first arms it
        const b = this.selEntity(); if (!b) break;
        if (this.demoArm === b.id && performance.now() - this.demoT < 4000) { this.demoArm = null; this.host.send({ type: 'demolish', buildingId: b.id }); this.clearSel(); }
        else { this.demoArm = b.id; this.demoT = performance.now(); this.toast(`Click Pull down again to pull down this ${BUILDINGS[b.kind].label.toLowerCase()}.`, 'warn'); }
        break;
      }
      case 'captain': { const u = this.selUnits()[0]; if (u) this.host.send({ type: 'captain', unitId: u.id }); break; }
      case 'selroll': { const b = this.selEntity(); if (b) { const r = this.rollOf(b).filter((u) => !u.inside); if (r.length) this.setUnits(r); } break; }
      case 'drill': {
        const b = this.selEntity(); if (!b) break;
        let u = this.gsel != null ? g.byId.get(this.gsel) : null;
        if (!u || u.inside !== b.id || u.drilling || (u.kind !== 'recruit' && u.kind !== 'serf')) u = b.garrison.map((id) => g.byId.get(id)).find((x) => x && !x.drilling && (x.kind === 'recruit' || x.kind === 'serf'));
        if (!u) { this.toast('No recruit or serf inside to drill. Right-click the keep with them.', 'warn'); break; }
        this.host.send({ type: 'drill', buildingId: b.id, unitId: u.id, kind: d.kind });
        break;
      }
      case 'select': { const e = g.byId.get(+d.id); if (e) this.sel = e.type === 'unit' ? { type: 'units', ids: [e.id], id: null } : { type: e.type, ids: [], id: e.id }; break; }
      default: break;
    }
    this.sigCmd = this.sigSel = '';
  }
  // One treaty request, with the reason shown whenever it is refused
  treaty(team, state, coin = 0) {
    const g = this.game, name = HOUSES[team].name;
    const r = this.host.send({ type: 'relation', other: team, state, coin });
    if (r === 'pending') this.toast(`Offer sent to ${name}.`, 'info');
    else if (r) this.toast(state === 'war' ? `War on ${name}!` : state === 'trade' ? `Trade treaty with ${name}.` : state === 'alliance' ? `Alliance with ${name}.` : `Peace with ${name}.`, state === 'war' ? 'war' : 'good');
    else this.toast(g.diploNote || `${name} refuses.`, 'warn');
    this.sigDiplo = ''; this.renderDiplo();
  }
  // one house, as a card: leader, size, wealth, power, influence, attitude, and what you may do about it (compact = the small popover)
  houseCard(t, compact = false) {
    const g = this.game, i = intel(g, t), me = t === PLAYER, rel = i.rel;
    if (!i.known && !me) return `<div class="dline">Not met. Scout toward them to open talks.</div>`;
    const DOC_TIP = { granary: 'Farms, temple and market first; a smaller army with more bowmen; slow to go to war.', legion: 'Barracks, towers and a keep first; the largest line of foot.', hold: 'Archery and towers first; mostly bowmen; keeps two spies; a little slow to war.', hearth: 'Market, mill and cottages first; a balanced army; slow to war.', raid: 'Stables and archery early; horse and bow; keeps two spies; quick to war.' };
    const L = i.leader, lead = L.alive ? `${esc(L.title)} ${esc(L.name)}` : `Throne empty${L.heirIn != null ? ` · heir in ${L.heirIn}s` : ''}`;
    const tempTip = { warlike: 'Quick to war, slow to forgive.', mercantile: 'Loves trade and tribute; despises a poor partner.', honourable: 'Keeps oaths and expects the same.', cunning: 'Allies with the strong, turns on the weak.' }[L.temper] || '';
    const ranks = RANKS[L.rank]?.label || '';
    const stat = (label, val, tip) => `<div class="hs" ${tip ? `data-tip="${encodeURIComponent(tip)}"` : ''}><label>${label}</label><b>${val}</b></div>`;
    const mine = intel(g, PLAYER);
    let html = `<div class="hleader" data-tip="${encodeURIComponent(`<b>${esc(L.temper || '')}</b><br>${tempTip}`)}">${compact ? '' : uiImg('portraits', RULER_ART[HOUSES[t].faction], '', 'rport')}♔ <b>${lead}</b>${L.alive ? ` <span class="rk">${'▲'.repeat(L.rank)} ${ranks}</span>` : ''}${L.temper ? ` <span class="tmp ${L.temper}">${L.temper}</span>` : ''} <small data-tip="${encodeURIComponent('<b>The royal line</b><br>When a king falls the next heir is crowned. When the last of the line dies, the house falls.')}">${i.heirs > 0 ? `· ${i.heirs} heir${i.heirs === 1 ? '' : 's'}` : '· <b style="color:#e0866a">last of the line</b>'}${i.fugitive ? ` · ${uiImg('marks', 'fugitive')}<b style="color:#e0866a">fugitive, seat lost</b>` : ''}</small>${i.doctrine ? ` <small data-tip="${encodeURIComponent(`<b>Doctrine: ${i.doctrine}</b><br>${DOC_TIP[i.doctrine] || ''}<br><span class='info'>How this people plays when it is not copying what it has learned from you.</span>`)}">· plays the ${esc(i.doctrine)}</small>` : ''}</div>`;
    html += `<div class="hstats">`
      + stat('Rank', `#${i.rank}`, `Composite of wealth, villages, folk, power, learning and arms.<br>Score ${i.score}`)
      + stat('Villages', `${i.land}${me ? '' : ` <small>(you ${mine.land})</small>`}`, `${i.landPop} folk live in them.`)
      + stat('Folk', i.pop, 'Population used.')
      + stat('Army', `${i.army}${me ? '' : ` <small>(you ${mine.army})</small>`}`, 'Soldiers in the field and garrisons.')
      + stat('Power', `${i.power}${me ? '' : ` <small>(you ${mine.power})</small>`}`, 'Health × damage of every fighter, ranks and king included. A rookie footman is 1.0.')
      + stat('Money', `${i.moneyExact ? '' : '≈ '}${i.moneyShown}`, i.moneyExact ? 'Their purse, shown because you trade or are allied.' : 'Their purse, guessed. Trade or ally to see it exactly.')
      + stat('Influence', `${i.influence}${i.leaning ? ` <small>(${i.leaning} leaning)</small>` : ''}`, 'How hard their keeps, markets, temples and mines lean on villages they do not hold; villages leaning their way.')
      + stat('Learning', `${i.sci}/${TECH_KEYS.length} · arms ${i.arms}`, `Technologies known (of ${TECH_KEYS.length}) and the forge's arms level.${i.techs ? `<br>Known: ${i.techs.join(', ') || 'none'}` : '<br>Trade, ally or spy on them to learn which.'}`)
      + `</div>`;
    if (me) return html;
    const rels = [];
    if (i.allies.length) rels.push('Allied with ' + i.allies.map((c) => esc(HOUSES[c].short)).join(', '));
    if (i.enemies.length) rels.push('At war with ' + i.enemies.map((c) => esc(HOUSES[c].short)).join(', '));
    if (rels.length) html += `<div class="dline">${rels.join(' · ')}</div>`;
    html += `<div class="dline"><span class="att ${i.opinion >= 10 ? 'good' : i.opinion <= -10 ? 'bad' : ''}">${i.attitude} toward you (${i.opinion >= 0 ? '+' : ''}${i.opinion})</span>${i.why.length ? ' · ' + i.why.map((w) => `${w.d > 0 ? '+' : ''}${w.d} ${esc(w.why)}`).join('; ') : ''}</div>`;
    if (i.stance) {
      const st = i.stance, pct = (x) => Math.round(Math.min(1, x) * 100), top = st.reasons.slice(0, 3).map((r) => esc(r.text)).join('; ');
      const col = st.mood === 'means war' || st.mood === 'fighting on' ? '#e0866a' : st.mood === 'wary' ? '#e8c35a' : '#9fe08f';
      html += `<div class="dline" data-tip="${encodeURIComponent('<b>How they see you</b><br><b>Threat</b>: your buildings swaying their villages, your soldiers in their land, your army close and stronger.<br><b>Temptation</b>: you are weaker, busy at war, leaderless, broke, or a village of yours lies close and poorly guarded.<br><b>Ties</b>: trade, alliance, a common enemy, goodwill, distance, a fresh peace.<br>They go to war when threat and temptation clearly outweigh the ties (and warn you first).')}">They see you: <b style="color:${col}">${st.mood}</b> · threat ${pct(st.threat)}% · temptation ${pct(st.temptation)}% · ties ${pct(st.ties)}%${rel === 'war' ? ` · weariness ${pct(st.weariness)}%` : ''}${top ? `<br><small>${top}</small>` : ''}</div>`;
    }
    if (i.secrets) {
      const s = i.secrets, mix = Object.entries(s.mix).map(([k, n]) => `${n} ${UNITS[k].label.toLowerCase()}${n === 1 ? '' : 's'}`).join(', ') || 'no soldiers';
      const plan = s.war != null ? `means war on <b>${s.war === PLAYER ? 'you' : esc(HOUSES[s.war].short)}</b>` : s.warIn ? `not ready for war (about ${Math.ceil(s.warIn / 60)} min)` : 'no war planned';
      html += `<div class="dline" data-tip="${encodeURIComponent('<b>Spy report</b><br>Your spy inside one of their villages sends word. It fades 45 s after the spy leaves or is caught; a caught spy angers their lord.')}">🕵 <b>Spy report:</b> ${mix}${s.captains.length ? ` · captains ${s.captains.map(esc).join(', ')}` : ''}${s.far.length ? ` · far-landers ${s.far.map(esc).join(', ')}` : ''} · ${plan}${s.village ? ` · marching on <b>${esc(s.village)}</b>` : ''}${s.research ? ` · studying ${esc(s.research)}` : ''}${s.kit?.length ? ` · kit in store: ${s.kit.map(esc).join(', ')}` : ''}</div>`;
    } else if (i.known) html += `<div class="dline" style="opacity:.7">Put a spy inside one of their villages to learn their army, captains and plans.</div>`;
    const known = true, wait = Math.ceil(g.parleyIn(PLAYER, t)), pend = g.offers.some((o) => o.from === PLAYER && o.to === t) || (g.asks || []).some((x) => x.from === PLAYER && x.to === t);
    const btn = (state, label, why) => `<button class="dbtn ${rel === state ? 'cur' : ''} ${state === 'war' ? 'warbtn' : ''}" data-act="treaty" data-team="${t}" data-state="${state}" ${rel === state || why ? 'disabled' : ''} title="${esc(why || '')}">${label}</button>`;
    const peaceWhy = rel === 'war' && wait > 0 ? `Parley in ${wait}s` : pend ? 'Offer sent' : '';
    const tradeWhy = rel === 'war' ? 'Make peace first' : rel === 'alliance' ? 'Allies already trade' : pend ? 'Offer sent' : '';
    const allyWhy = rel === 'war' ? 'End the war first' : pend ? 'Offer sent' : '';
    html += `<div class="drow">${btn('peace', 'Peace', peaceWhy)}${btn('trade', 'Trade', tradeWhy)}${btn('alliance', 'Alliance', allyWhy)}${btn('war', 'War', '')}</div>`;
    if (rel === 'war' && !me) {   // peace bought with a share of the treasury: the coin rides with the envoy and is paid only if they agree
      const purse = Math.floor(g.players[PLAYER].gold);
      html += `<div class="drow">${PEACE_COIN.shares.map((f) => { const c = Math.floor(purse * f); return `<button class="dbtn sm" data-act="treaty" data-team="${t}" data-state="peace" data-coin="${c}" ${peaceWhy || c < 10 ? 'disabled' : ''} data-tip="${encodeURIComponent(`<b>Peace and ${Math.round(f * 100)}% of our coin</b><br>Your envoy offers peace and ${c} coin. Paid only if ${esc(HOUSES[t].short)} agrees; the more coin, the likelier they take it, even while they are winning.`)}">Peace + ${Math.round(f * 100)}% (${c}c)</button>`; }).join('')}</div>`;
    }
    const gold = g.players[PLAYER].gold, ask = (act, label, tip, extra = '', off = false) => `<button class="dbtn sm" data-act="${act}" data-team="${t}" ${extra} ${off ? 'disabled' : ''} data-tip="${encodeURIComponent(tip)}">${label}</button>`;
    html += `<div class="drow">${ask('gift', 'Gift 50c', 'Send 50 coin. Warms them (more if they are mercantile).', 'data-amount="50"', gold < 50)}${ask('gift', 'Gift 150c', 'Send 150 coin.', 'data-amount="150"', gold < 150)}`
      + `${ask('demand', 'Demand tribute', 'Demand coin. Only the far weaker pay; the proud refuse and remember.', `data-amount="${Math.max(40, Math.min(300, Math.round((i.moneyShown * 0.15) / 10) * 10))}"`, rel === 'war')}`
      + `${ask('askaid', 'Ask 80c aid', 'A friend with coin to spare may send it.', 'data-amount="80"', rel === 'war')}</div>`;
    // houses they could fight for you: your enemies first (owner, 2026-10-17: there was no way to ask another king for help in a war; the row was only in the Council)
    const others = g.players.filter((p) => p.alive && p.team !== PLAYER && p.team !== t && g.known[PLAYER][p.team]).sort((x, y) => (g.rel[PLAYER][y.team] === 'war') - (g.rel[PLAYER][x.team] === 'war'));
    if (others.length && rel !== 'war') html += `<div class="drow wrap"><span class="dlabel">Ask them to help you: declare war on</span>${others.map((p) => ask('askwar', `⚔ ${esc(HOUSES[p.team].short)}${g.rel[PLAYER][p.team] === 'war' ? ' (your enemy)' : ''}`, `Ask ${esc(HOUSES[t].short)} to take up arms against ${esc(HOUSES[p.team].short)}. Friends and allies listen, if the odds look fair.`, `data-target="${p.team}"`, false)).join('')}</div>`;
    html += `<div class="dnote">${rel === 'war' ? (wait > 0 ? `They will not parley for ${wait}s.` : 'They may take peace if they are not winning.') : rel === 'alliance' ? 'Allies trade freely, never fight each other, and take up each other’s wars. Breaking the oath is remembered by everyone. Victory still needs every house to fall.' : rel === 'trade' ? 'Camels may use their markets. Peace cancels it; war breaks it.' : 'No fighting, no trade. A treaty lets your camels use their markets; an alliance binds you.'}</div>`;
    if (compact) html += `<div class="drow"><button class="dbtn sm" data-act="council" data-team="${t}">Open the Council ›</button></div>`;
    return html;
  }
  // an entry in the correspondence list
  letterRow(l) {
    const mine = l.to === PLAYER || l.from === PLAYER;
    const s = { open: 'waiting', accepted: 'accepted', declined: 'declined', ignored: 'lapsed', lapsed: 'lapsed', note: '' }[l.state] || '';
    return `<div class="lrow ${l.state}"><span class="lt">${Math.floor(l.t / 60)}:${String(Math.floor(l.t % 60)).padStart(2, '0')}</span><span class="lx">${esc(l.text)}</span>${s ? `<em>${s}</em>` : ''}</div>`;
  }
  councilHtml() {
    const g = this.game;
    const rows = ranking(g), dead = g.players.filter((p) => !p.alive);
    const order = [...rows.map((r) => r.team), ...dead.map((p) => p.team)];
    let html = `<div class="chead"><b>The Council of Houses</b><span>Ranked by wealth, villages, folk, power and learning · C or Esc to close</span><button class="dx" data-act="councilclose">×</button></div><div class="ccards">`;
    for (const t of order) {
      const pl = g.players[t], i = intel(g, t), me = t === PLAYER;
      const known = i.known || me;
      html += `<div class="hcard ${me ? 'me' : ''} ${pl.alive ? '' : 'fallen'} ${this.councilFocus === t ? 'focus' : ''}"><div class="hctop"><canvas width="30" height="34" data-ccrest="${t}"></canvas><div><b style="color:${HOUSES[t].accent}">${esc(HOUSES[t].name)}</b><div class="hmotto">${esc(HOUSES[t].motto)}</div></div>${me ? '<span class="rel me">you</span>' : `<span class="rel ${i.rel}">${known ? i.rel : 'unmet'}</span>`}${pl.alive && known ? `<span class="hrank">#${i.rank}</span>` : ''}</div>${pl.alive ? this.houseCard(t) : '<div class="dline">This house has fallen.</div>'}</div>`;
    }
    html += `</div><div class="ctitle">Correspondence</div><div class="letters">${g.letters.filter((l) => l.to === PLAYER || l.from === PLAYER).slice(0, 14).map((l) => this.letterRow(l)).join('') || '<div class="hint">No letters yet. Rival lords write once they have met you.</div>'}</div>`;
    return html;
  }
  toggleCouncil(team = null) {
    const el = $('council'); this.councilOpen = team != null ? true : !this.councilOpen; this.councilFocus = team;
    if (team != null) { this.diploOpen = null; this.renderDiplo(); }
    el.classList.toggle('hidden', !this.councilOpen); this.sigCouncil = ''; if (this.councilOpen) this.renderCouncil();
  }
  renderCouncil() {
    if (!this.councilOpen) return;
    const html = this.councilHtml();
    if (html !== this.sigCouncil) {
      this.sigCouncil = html; const el = $('council'), top = el.scrollTop; el.innerHTML = html; el.scrollTop = top;
      el.querySelectorAll('canvas[data-ccrest]').forEach((c) => { const x = c.getContext('2d'); x.clearRect(0, 0, 30, 34); drawCrest(x, 15, 17, 28, +c.dataset.ccrest); });
    }
  }
  // asks of another house: one call, with the answer toasted (or the reason it was refused)
  ask(type, other, extra = {}) {
    const g = this.game, r = this.host.send({ type, other, ...extra });
    if (!r && !g.events.some((e) => e.team === PLAYER && e.text === g.diploNote)) this.toast(g.diploNote || 'Refused.', 'warn');   // (the answer is already in the game's own message; say it once)
    this.sigDiplo = this.sigCouncil = ''; this.renderDiplo(); this.renderCouncil();
  }
  toggleDiplo(team) { if (team === PLAYER) return; this.diploOpen = this.diploOpen === team ? null : team; this.sigDiplo = ''; this.renderDiplo(); }
  // the diplomacy panel under a house's chip: where you stand, and the three explicit choices
  renderDiplo() {
    const el = $('diplo'), g = this.game, t = this.diploOpen;
    if (t == null || !g.alive(t)) { this.diploOpen = null; if (!el.classList.contains('hidden')) el.classList.add('hidden'); return; }
    const html = `<div class="dhead"><b style="color:${HOUSES[t].accent}">${esc(HOUSES[t].name)}</b><button class="dx" data-act="diploclose">×</button></div>` + this.houseCard(t, true);
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
      const km = this.kmap, pan = (id) => this.keys.has(km[id]) && !(this.gridKeys && GRID_KEYS.includes(km[id]));   // (the pan keys are rebindable, T03; the arrows always pan; with Grid keys on, a pan key on the grid is the grid's)
      if (pan('panUp') || this.keys.has('arrowup')) dy -= spd;
      if (pan('panDown') || this.keys.has('arrowdown')) dy += spd;
      if (pan('panLeft') || this.keys.has('arrowleft')) dx -= spd;
      if (pan('panRight') || this.keys.has('arrowright')) dx += spd;
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
    // news of other houses is one quiet line (its first sentence) so it never crowds out what happens to you; a war on you sounds the horn
    for (const ev of g.events.splice(0)) {
      if (ev.team === PLAYER) { this.toast(ev.text, ev.kind); if (ev.kind === 'war') play('alarm'); }
      else if (ev.team === -1) this.toast(ev.text.split(/(?<=[.!])\s/)[0], 'news');
    }
    this.renderObjectives();
    g.sfxOn = true; g.dmgNums = this.dmgNums; for (const s of g.sfxQ.splice(0)) playAt(s.name, s.x, s.y, this.r.cam);
    this.hudT -= dt;
    // (not while a button is held down: a panel rebuilt under the pointer loses the click)
    if (this.hudT <= 0 && !this.uiHold) { this.hudT = 0.12; this.autoSave(); this.renderOffers(); this.renderCouncil(); this.renderTop(); this.renderSel(); this.renderCmd(); this.renderGroups(); if (this.diploOpen != null) this.renderDiplo(); }
    if (g.outcome && !this.endShown) this.showEnd();
    if (this.campaignOpen) { this.campT = (this.campT || 0) - dt; if (this.campT <= 0) { this.campT = 0.15; this.drawCampaign(); } }
  }

  rivalUnitSel() { const s = this.sel; return s?.type === 'units' && this.selUnits().some((u) => u.team !== PLAYER); }
  toast(text, kind = 'info') {
    text = packWords(text, PLAYER);
    const box = $('toasts');
    if (box.lastChild && box.lastChild.dataset.t === text) return;
    const el = document.createElement('div'); el.className = `toast ${kind}`; el.textContent = text; el.dataset.t = text;
    if (kind === 'bad' && /under attack/.test(text) && uiArt('marks', 'alarm')) { const i = document.createElement('img'); i.className = 'ico'; i.src = uiArt('marks', 'alarm'); i.alt = ''; el.prepend(i); }   // the war-horn mark when painted (ARTREQUIREMENTS priority 7)
    if (kind === 'news') box.querySelectorAll('.toast.news').forEach((n) => n.remove());   // one line of news at a time
    box.appendChild(el);
    while (box.children.length > 4) (box.querySelector('.toast.news') || box.firstChild).remove();   // news gives way first: an alarm is never pushed off by gossip
    setTimeout(() => el.classList.add('fade'), 3800); setTimeout(() => el.remove(), 4500);
  }

  renderOffers() {
    const g = this.game, p = g.players[PLAYER];
    const html = g.offers.filter((o) => o.to === PLAYER).map((o) => {
      const kind = o.kind || 'treaty', N = esc(HOUSES[o.from].short), left = Math.max(0, Math.ceil((o.expires ?? g.time + 60) - g.time));
      const poor = (kind === 'tribute' || kind === 'aid') && p.gold < o.amount;
      const ok = { treaty: o.state === 'peace' && o.amount ? `Accept (+${o.amount}c)` : 'Accept', joinwar: `Join the war on ${o.target != null ? esc(HOUSES[o.target].short) : ''}`, tribute: `Pay ${o.amount}c`, aid: `Send ${o.amount}c` }[kind];
      const no = { treaty: 'Decline', joinwar: 'Decline', tribute: 'Refuse', aid: 'Refuse' }[kind];
      const text = o.text || `${esc(HOUSES[o.from].name)} offers ${o.state === 'trade' ? 'a trade treaty' : o.state === 'alliance' ? 'an alliance' : 'peace'}.`;
      // a demand says what refusing risks: in play a refused (or ignored) demand was the only warning before an army came (playtest 2026-10-14)
      const stake = kind === 'tribute' ? `<div class="ostake">Refuse or let it lapse and ${N} may march on you. Their army <b class="oarm" data-team="${o.from}"></b>, yours <b class="oarm" data-team="${PLAYER}"></b>.</div>` : '';   // (the counts are filled in place below, like the countdown)
      return `<div class="offer ${kind}" style="border-color:${HOUSES[o.from].accent}"><div class="oh"><b style="color:${HOUSES[o.from].accent}">${N}</b><span class="ok">${{ treaty: o.state === 'alliance' ? 'Alliance' : o.state === 'trade' ? 'Trade treaty' : 'Peace', joinwar: 'Call to arms', tribute: 'Demand', aid: 'Plea for aid' }[kind]}</span><small class="ocd" data-id="${o.id}"></small></div><div class="otext">${esc(text)}</div>${stake}<div class="row"><button data-act="respond" data-team="${o.from}" data-accept="1" data-id="${o.id}" ${poor ? 'disabled title="Not enough coin"' : ''}>${ok}</button><button data-act="respond" data-team="${o.from}" data-accept="0" data-id="${o.id}">${no}</button><button data-act="council" data-team="${o.from}" title="Open the council to see their strength">Intel</button></div></div>`;
    }).join('');
    if (html !== this.sigOffers) { this.sigOffers = html; $('offers').innerHTML = html; }
    for (const o of g.offers) if (o.to === PLAYER && !(this.heard ||= new Set()).has(o.id)) { this.heard.add(o.id); play(o.kind === 'tribute' ? 'alarm' : 'letter'); }   // a letter arrives with a sound, a demand with the horn
    for (const el of $('offers').querySelectorAll('.oarm')) { const t = String(g.soldiersOf(+el.dataset.team).length); if (el.textContent !== t) el.textContent = t; }
    for (const el of $('offers').querySelectorAll('.ocd')) { const o = g.offers.find((x) => x.id === +el.dataset.id); const t = o ? `${Math.max(0, Math.ceil((o.expires ?? g.time + 60) - g.time))}s` : ''; if (el.textContent !== t) el.textContent = t; }   // the countdown ticks in place: rebuilding the card would swallow a click
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
      if (p.tech && (Object.keys(p.tech).length || p.research)) parts.push(`<span class="sk lv" data-tip="${encodeURIComponent(`<b>Science: ${Object.keys(p.tech).map((k) => TECH[k].label).join(', ') || 'nothing yet'}</b><br>${p.research ? `Researching ${TECH[p.research].label}: ${Math.floor(p.learning || 0)}/${TECH[p.research].cost.learning} learning.` : 'No research under way: select an Academy.'}`)}">✎ ${Object.keys(p.tech).length}${p.research ? '…' : ''}</span>`);
      for (const k of GEAR_KEYS) if (p.gear?.[k] > 0) parts.push(`<span class="sk" data-tip="${encodeURIComponent(`<b>${GEAR[k].label}</b> in store<br>${GEAR[k].info}<br><span class='info'>For ${GEAR[k].for.join(', ')}s. Taken up at training, or when idle near an Armoury.</span>`)}">${uiImg('gear', k, '⛨')} ${esc(GEAR[k].label)} <b>${p.gear[k]}</b></span>`);
      const html = parts.join('');
      if (html !== this.sigStock) { this.sigStock = html; $('stock').innerHTML = html; }
    }
    if (this.showStand) { const sh = this.standingsHtml(); if (sh !== this.sigStand) { this.sigStand = sh; $('standings').innerHTML = `<div class="ctitle">Standings · T to close</div>${sh}`; } }
    $('r-pop').textContent = `${used}/${cap}`; $('r-popwrap').classList.toggle('low', used >= cap);
    const m = Math.floor(g.time / 60), s = Math.floor(g.time % 60);
    $('clock').textContent = `${m}:${String(s).padStart(2, '0')}`;
    const counts = new Array(g.houses).fill(0); for (const v of g.villages) if (v.owner >= 0) counts[v.owner]++;
    let html = '';
    // the rivals, condensed: each house is its crest, a pip for how you stand with it, and the villages it holds; the rest is in the tip
    for (let i = 0; i < g.houses; i++) {
      if (i === PLAYER) continue;
      const pl = g.players[i], met = g.known[PLAYER][i], rel = met ? g.rel[PLAYER][i] : 'unmet';
      const tip = `<b>${esc(pl.name)}</b> · ${esc(FACTIONS[HOUSES[i].faction]?.label || '')}<br>${pl.alive ? `Relation: <b>${met ? rel : 'not met'}</b> · ${counts[i]} village${counts[i] === 1 ? '' : 's'} · ${(pl.heirs ?? 2) <= 0 ? 'last of the line' : `${pl.heirs ?? 2} heir${(pl.heirs ?? 2) === 1 ? '' : 's'}`}` : 'Fallen.'}<br><span class='info'>${met ? 'Click for diplomacy: peace, trade treaty, alliance or war.' : 'Not met yet: scout toward them to treat.'}</span>`;
      html += `<div class="hchip rv ${pl.alive ? '' : 'fallen'}" data-house="${i}" data-tip="${encodeURIComponent(tip)}"><canvas width="22" height="24" data-crest="${i}"></canvas><i class="pip ${rel}"></i><span class="vc">${pl.alive ? counts[i] : '†'}</span></div>`;
    }
    if (this.brandFac !== HOUSES[PLAYER].faction) { this.brandFac = HOUSES[PLAYER].faction; const bc = $('brandCrest').getContext('2d'); bc.clearRect(0, 0, 36, 40); drawCrest(bc, 18, 20, 34, PLAYER); }   // (your people, and so your crest, change between games)
    if (html !== this.sigHouses) {
      this.sigHouses = html; $('houses').innerHTML = html;
      $('houses').querySelectorAll('canvas[data-crest]').forEach((c) => { const x = c.getContext('2d'); x.clearRect(0, 0, 22, 24); drawCrest(x, 11, 12, 20, +c.dataset.crest); });
    }
    const left = g.players.filter((x) => x.alive && x.team !== PLAYER);
    const frail = left.filter((x) => (x.heirs ?? 2) <= 0 || !g.seatOf(x.team));   // houses near their end: the last of the line, or a fugitive king
    // (the chips already show who stands; the bar speaks only of a house near its end, or of victory)
    const hb = left.length ? frail.map((x) => esc(HOUSES[x.team].short) + ((x.heirs ?? 2) <= 0 ? ' last of the line' : '') + (!g.seatOf(x.team) ? ' (fugitive)' : '')).join(', ') : 'Every rival has fallen.';
    if ($('holdbar').innerHTML !== hb) $('holdbar').innerHTML = hb;
    $('holdbar').classList.toggle('empty', !hb);
    document.querySelectorAll('.res').forEach((el) => { const r = el.dataset.res; if (r) el.classList.toggle('low', p[r] < 20); });
  }

  taskText(u) {
    const t = u.task;
    switch (t.type) {
      case 'move': return 'Marching';
      case 'amove': return t.patrol ? 'Patrolling' : 'Attack-moving';
      case 'attack': if (t.then?.patrol) return t.auto ? 'Fighting on patrol' : 'Attacking'; return t.auto ? 'Fighting' : 'Attacking';
      case 'gather': { const n = this.game.resources[t.nodeId]; return n ? `Gathering ${RES_LABEL[NODE_RES[n.kind]].toLowerCase()}` : 'Gathering'; }
      case 'mine': return 'Digging ore';
      case 'return': return 'Carrying goods home';
      case 'build': return 'Building';
      case 'infiltrate': return 'Infiltrating';
      case 'repair': return 'Repairing';
      case 'infiltrateB': { const b = this.game.byId.get(u.task.targetId); return b && b.team === u.team ? 'On watch' : 'Inside a building'; }
      case 'caravan': return u.route ? (t.stage === 'dwell' ? 'Trading at a market' : 'On its trade loop') : 'Heading home';
      default: return 'Idle';
    }
  }

  renderSel() {
    const g = this.game, p = g.players[PLAYER];
    let html = '';
    const s = this.sel;
    if (s.type === 'none') {
      const serfs = g.units.filter((u) => u.team === PLAYER && u.kind === 'serf' && u.hp > 0).length;
      const army = g.soldiersOf(PLAYER).length;
      const vs = g.villagesOf(PLAYER).length;
      html = `<div class="seltitle">${esc(HOUSES[PLAYER].name)}</div><div class="selsub">${esc(HOUSES[PLAYER].motto)}</div>
        <div class="stat"><label>Serfs</label><span>${serfs}</span></div><div class="stat"><label>Soldiers</label><span>${army}</span></div><div class="stat"><label>Villages</label><span>${vs} of ${g.villages.length}</span></div>
        <div class="selsub">Press <b>${keyName(this.kmap.hall)}</b> for your home village: draft serfs and raise buildings. Drag to select units. Right-click to act.</div>`;
    } else if (s.type === 'units') {
      const us = this.selUnits();
      if (us.length === 1) {
        const u = us[0], st = UNITS[u.kind], mine = u.team === PLAYER, far = u.far ? FARLANDS[u.far] : null;
        const who = far ? `${esc(far.label)} from ${esc(far.land)}<br>` : u.name ? `${u.trait ? `${esc(TRAITS[u.trait]?.label || '')}${u.origin ? ' of ' + esc(u.origin) : ''}<br>` : u.origin ? `Born in ${esc(u.origin)}<br>` : ''}` : '';
        html = `${portrait(u.kind, HOUSES[u.team].accent, u.team, faceOf(u) || undefined)}<div class="seltitle">${esc(u.name || (u.kind === 'camel' ? packOf(u.team).one.replace(/^./, (c) => c.toUpperCase()) : st.label))} <small style="color:${HOUSES[u.team].accent};font-size:12px">${u.captain ? 'Captain · ' : ''}${esc(u.title || st.label)} · ${esc(HOUSES[u.team].short)}</small></div><div class="selsub">${who}${esc(st.info)}</div>
          ${mine ? `<div class="stat"><label>Can</label><span>${esc(ABILITIES[u.kind] || '')}</span></div>` : this.foeRow(u.team)}
          <div class="stat"><label>Health</label><div class="meter"><i class="hp" style="width:${(u.hp / u.maxHp) * 100}%"></i></div><span class="v">${Math.ceil(u.hp)}/${u.maxHp}</span></div>
          <div class="stat"><label>Damage</label><span>${st.dmg ? g.shownDamage(u).toFixed(0) : '0'}${st.range > 1.6 ? ' ranged' : ''}</span><label>Speed</label><span>${(u.speed ?? st.speed).toFixed(1)}</span></div>
          ${g.ranked(u) ? this.rankRow(u) : ''}
          ${this.characterRows(u)}
          ${mine ? `<div class="stat"><label>Task</label><span>${this.taskText(u)}${u.carry && u.carry.amount > 0.5 ? ` · ${Math.floor(u.carry.amount)} ${u.carry.kind}` : ''}</span></div>` : ''}
          ${g.fighter(u) || u.kind === 'king' ? `<div class="stat"><label>Stance</label><span>${STANCE.label[g.stanceOf(u)]}</span></div>` : ''}`;
      } else {
        const by = {}; us.forEach((u) => { by[u.kind] = (by[u.kind] || 0) + 1; });
        html = `<div class="seltitle">${us.length} units</div><div class="selsub">Click a type to narrow the selection, or a name to pick one out. Ctrl+1..9 stores a group.</div><div class="chips">${Object.entries(by).map(([k, n]) => `<span class="chip x" data-act="kind" data-kind="${k}">${GLYPH[k]?.length === 1 ? GLYPH[k] : ''} ${UNITS[k].label} × ${n}</span>`).join('')}</div>${this.rollChips(us, 16)}`;
      }
    } else if (s.type === 'building') {
      const b = g.byId.get(s.id); if (!b) { this.clearSel(); return; }
      const st = BUILDINGS[b.kind], mine = b.team === PLAYER;
      html = `${portrait(b.kind, HOUSES[b.team].accent, b.team)}<div class="seltitle">${st.label}${b.kind === 'mine' && b.ore ? ` · <span style="color:${GOOD_COLOR[b.ore]}">${GOOD_LABEL[b.ore]}</span>` : ''} <small style="color:${HOUSES[b.team].accent};font-size:12px">${esc(HOUSES[b.team].short)}</small></div><div class="selsub">${esc(st.info)}</div>${b.town != null && g.byId.get(b.town) ? `<div class="hint">Part of the town of <b>${esc(g.byId.get(b.town).name)}</b>: it changes hands with the village.</div>` : ''}
        <div class="stat"><label>Health</label><div class="meter"><i class="hp" style="width:${(b.hp / b.maxHp) * 100}%"></i></div><span class="v">${Math.ceil(b.hp)}/${b.maxHp}</span></div>`;
      if (b.built < 1) html += `<div class="stat"><label>Building</label><div class="meter"><i class="prog" style="width:${b.built * 100}%"></i></div><span class="v">${Math.floor(b.built * 100)}%</span></div><div class="selsub">Right-click with serfs to help.</div>`;
      if (mine && b.built >= 1 && st.pop) html += `<div class="stat"><label>Population</label><span>+${st.pop}</span></div>`;
      if (mine && b.queue.length) {
        html += `<div class="qrow">${b.queue.map((q, i) => `<div class="qslot" data-act="cancel" data-i="${i}" data-tip="${encodeURIComponent(`<b>${UNITS[q.kind].label}</b><br>Click to cancel (refund).`)}">${GLYPH[q.kind].length === 1 ? GLYPH[q.kind] : 'R'}${i === 0 ? `<i style="width:${(q.t / UNITS[q.kind].time) * 100}%"></i>` : ''}</div>`).join('')}</div>`;
      }
      if (mine && b.built >= 1 && GARRISON[b.kind]) {
        const inn = b.garrison.map((id) => g.byId.get(id)).filter(Boolean);
        html += `<div class="stat"><label>Garrison</label><span>${inn.length}/${GARRISON[b.kind]} inside${b.kind === 'keep' ? ' (heal while inside)' : ''}</span></div>`;
        if (b.kind === 'keep') { const n = g.keepArrows(b); html += `<div class="stat" data-tip="${encodeURIComponent(`<b>Arrows</b><br>Every ${KEEP_ARROWS.per} folk inside (soldiers, serfs sheltering from the bell, scholars) add an arrow to each volley, up to ${KEEP_ARROWS.cap}, at the nearest foes within ${g.keepRange(b)} tiles: ${KEEP_ARROWS.dmg} damage each, a volley every ${KEEP_ARROWS.cd} s.`)}"><label>Arrows</label><span>${n ? `${n} a volley, range ${g.keepRange(b)}` : `none: it shoots with ${KEEP_ARROWS.per} or more folk inside`}</span></div>`; }
        if (inn.length) html += `<div class="chips">${inn.map((u) => `<span class="chip x ${this.gsel === u.id ? 'on' : ''}" data-act="gsel" data-id="${u.id}" data-tip="${encodeURIComponent(`<b>${esc(u.name || UNITS[u.kind].label)}</b><br>${UNITS[u.kind].label}${u.trait ? ' · ' + TRAITS[u.trait].label : ''} · ${Math.ceil(u.hp)}/${u.maxHp} hp${u.drilling ? '<br>In training' : ''}`)}">${GLYPH[u.kind]?.length === 1 ? GLYPH[u.kind] : ''} ${esc(u.name || UNITS[u.kind].label)}${u.drilling ? ' …' : ''}</span>`).join('')}</div>`;
      }
      if (mine && b.kind === 'keep' && b.built >= 1) {   // the sheds: siege engines stored apart from the garrison
        const eng = (b.engines || []).map((id) => g.byId.get(id)).filter(Boolean);
        html += `<div class="stat" data-tip="${encodeURIComponent('<b>Engine sheds</b><br>Right-click this keep with a ram, onager or trebuchet to store it here, out of harm\'s way and kept in repair. <b>Leave</b> rolls them out with the garrison.')}"><label>Engines</label><span>${eng.length}/${SIEGE_STORE} in the sheds${eng.length ? ': ' + eng.map((u) => esc(UNITS[u.kind].label)).join(', ') : ''}</span></div>`;
      }
      if (!mine) html += this.foeRow(b.team) + (GARRISON[b.kind] && g.canSee(PLAYER, b.x, b.y) ? `<div class="stat"><label>Garrison</label><span>${b.garrison.length ? `about ${b.garrison.length} inside` : 'empty, as far as your scouts can tell'}</span></div>` : '');
      if (mine && b.built >= 1) { const roll = this.rollOf(b); if (roll.length) html += `<div class="stat"><label>Muster roll</label><span>${roll.length} raised here still serve${roll.some((u) => u.inside) ? ` (${roll.filter((u) => u.inside).length} inside somewhere)` : ''}</span></div>${this.rollChips(roll, 12)}`; }
      if (mine && b.kind === 'keep' && b.built >= 1) { const lv = b.levy != null ? g.byId.get(b.levy) : null; html += `<div class="stat"><label>Levy</label><span>${lv ? `${esc(lv.name)} (${Math.floor(lv.pop)} villagers left)` : 'none: right-click a village you hold'}</span></div>`; }
      if (b.kind === 'mine' && b.built >= 1) {
        const left = b.nodeIds.reduce((a, id) => a + Math.max(0, g.resources[id].amount), 0), max = b.nodeIds.reduce((a, id) => a + g.resources[id].max, 0);
        html += `<div class="stat"><label>${GOOD_LABEL[b.ore]}</label><div class="meter"><i class="ore" style="width:${(left / max) * 100}%"></i></div><span class="v">${Math.ceil(left)}</span></div>${this.crewHtml(b)}`;
      }
      if (mine && b.kind === 'foundry' && b.built >= 1) html += `<div class="stat"><label>Furnace</label><span>${b.job ? `smelting ${GOOD_LABEL[b.job.kind].toLowerCase()} ${Math.floor((b.job.t / SMELT[b.job.kind].time) * 100)}%` : 'cold: needs iron + coal, or copper + coal'}</span></div>`;
      if (mine && b.kind === 'armoury' && b.built >= 1) html += `<div class="stat"><label>Making</label><span>${b.craft?.length ? `${GEAR[b.craft[0].item].label} ${Math.floor((b.craft[0].t / GEAR[b.craft[0].item].time) * 100)}%${b.craft.length > 1 ? ` · ${b.craft.length - 1} more` : ''}` : 'idle: order kit below'}</span></div>`;
      if (mine && b.kind === 'forge' && b.built >= 1) html += `<div class="stat"><label>Arms</label><span>level ${p.arms}/3 · ${Math.floor(p.steel)}/${ARMS_STEEL} steel for the next</span></div>`;
      if (mine && b.kind === 'academy') { const r = p.research ? TECH[p.research] : null; html += `<div class="stat"><label>Learning</label><span>${Math.floor(p.learning || 0)} banked · +${(p.learnRate || 0).toFixed(2)} a second from your academies</span></div><div class="stat"><label>Research</label>${r ? `<div class="meter"><i class="prog" style="width:${Math.min(100, ((p.learning || 0) / r.cost.learning) * 100)}%"></i></div><span class="v">${esc(r.label)}</span>` : `<span>${Object.keys(p.tech || {}).length}/${TECH_KEYS.length} known · choose the next below</span>`}</div>`; }
      if (mine && b.kind === 'academy') html += `<div class="stat"><label>Scholars</label><span>${b.scholars || 0}/4 near: +${(b.scholars || 0) * 30}% influence</span></div>`;
    } else if (s.type === 'village') {
      const v = g.byId.get(s.id); if (!v) { this.clearSel(); return; }
      const k = VILLAGE_KINDS[v.kind], lord = v.owner >= 0 ? HOUSES[v.owner].name : 'Independent';
      const tr = k.tribute;
      html = `<div class="seltitle">${esc(v.name)} <small style="color:#cdbb8a;font-size:12px">${v.founded ? (v.kind === 'mine' ? 'Mining camp' : 'Village') : k.label}</small></div><div class="selsub">${v.founded ? (v.kind === 'mine' ? 'Founded by your house beside ore. Its folk work the mines within 16 tiles at camp rates, pay tax and can be drafted.' : 'Founded by your house. Its folk till, pay tax and can be drafted.') : esc(k.blurb)}${v.owner === PLAYER ? ` Tax <b>+${(v.pop * TAX * (v.loyalty / 100)).toFixed(2)}</b> coin/s.` : ''}</div>
        <div class="stat"><label>Lord</label><span>${esc(lord)}</span></div>
        <div class="stat"><label>Loyalty</label><div class="meter"><i class="loy" style="width:${v.loyalty}%"></i></div><span class="v">${v.loyalty | 0}</span></div>
        <div class="stat"><label>Protection</label><div class="meter"><i class="pro" style="width:${(v.protection / v.maxProtection) * 100}%"></i></div><span class="v">${v.protection | 0}/${v.maxProtection}</span></div>
        <div class="stat"><label>Population</label><div class="meter"><i class="loy" style="width:${(v.pop / v.popMax) * 100}%"></i></div><span class="v">${Math.floor(v.pop)}/${v.popMax}</span></div>
        <div class="stat"><label>Folk</label><span>${v.folk.join(', ')} · ${v.hunger ? '<b style="color:#e0866a">starving: the store is out of grain</b>' : v.pop >= v.popMax ? 'at full strength' : 'growing (fed from the village store)'} · grain ${Math.floor(v.stores.food || 0)}</span></div>${v.owner === PLAYER ? `<div class="stat"><label>Housing</label><span>houses ${Math.floor(v.pop * POP_HOUSING)} of your population cap; tribute ${Math.round((0.5 + 0.7 * (v.pop / v.popMax)) * 100)}% of base</span></div>` : ''}
        <div class="stat"><label>Influence</label><span>${this.pullText(v)}</span></div>${v.owner === PLAYER ? this.watchRow(v) : ''}${v.owner === PLAYER && v.garrison?.length ? `<div class="stat"><label>Garrison</label><span>${v.garrison.length}/${VILLAGE_GARRISON} inside</span></div>${this.rollChips(v.garrison.map((id) => g.byId.get(id)).filter(Boolean), 8)}` : ''}${v.joyT > 0 ? `<div class="stat"><label>Mood</label><span style="color:#9fe08f">Content (fine ware): +30% tribute</span></div>` : v.owner === PLAYER ? `<div class="stat"><label>Mood</label><span>Fine ware from a foundry (copper + coal) near a market, tavern or temple would please them.</span></div>` : ''}`;
    } else if (s.type === 'node') {
      const n = g.resources[s.id]; if (!n) { this.clearSel(); return; }
      const res = NODE_RES[n.kind];
      if (MINEABLE.includes(n.kind)) {
        const m = g.buildings.find((b) => b.kind === 'mine' && b.hp > 0 && b.nodeIds?.includes(n.id));
        html = `<div class="seltitle">${GOOD_LABEL[n.kind]} deposit</div><div class="selsub">${esc(GOOD_INFO[n.kind])} ${m ? '' : 'Raise a <b>Mine</b> on it, then assign serfs.'}</div><div class="stat"><label>Remaining</label><span>${Math.ceil(n.amount)}</span></div><div class="stat"><label>Worth</label><span>${RES_VALUE[n.kind]} each</span></div>`;
        if (html !== this.sigSel) { this.sigSel = html; $('selPanel').innerHTML = this.rivalUnitSel() ? html : packWords(html, PLAYER); }   // (a rival's beast keeps its own name)
        return;
      }
      html = `<div class="seltitle">${{ tree: 'Timber stand', berry: 'Berry bushes' }[n.kind]}</div><div class="selsub">Right-click with serfs to gather ${RES_LABEL[res].toLowerCase()}.</div><div class="stat"><label>Remaining</label><span>${Math.ceil(n.amount)}</span></div>`;
    }
    if (html !== this.sigSel) { this.sigSel = html; $('selPanel').innerHTML = this.rivalUnitSel() ? html : packWords(html, PLAYER); }   // (a rival's beast keeps its own name)
  }

  // a spy's coat: wear a house's colours (any house met) to walk into its buildings, or your own again
  disguiseGrid(spies) {
    const g = this.game, now = spies[0].disguise ?? null;
    let html = `<div class="ctitle">Disguise${now != null ? `: <b style="color:${HOUSES[now].accent}">${esc(HOUSES[now].short)}</b>` : ''}</div><div class="cgrid c4">`;
    html += this.btn('disguise', { glyph: '◉', name: 'Own colours', cls: now == null ? 'on' : '', data: { as: -1 }, tip: '<b>Own colours</b><br>Drop the disguise.' });
    for (let t = 0; t < g.houses; t++) {
      if (t === PLAYER || !g.known[PLAYER][t] || !g.players[t].alive) continue;
      html += this.btn('disguise', { glyph: '🎭', name: HOUSES[t].short, cls: now === t ? 'on' : '', data: { as: t }, tip: `<b>Disguise as ${esc(HOUSES[t].name)}</b><br>He wears their colours: their soldiers and towers take him for one of theirs. Then right-click one of their buildings (keep, barracks, market, academy...) to send him inside: he sends word home, slows their training, skims a market's coin or copies an academy's learning, until they catch him.<br><span class='info'>Right-click a building of yours with a spy to post him there as a watchman against theirs.</span>` });
    }
    return html + '</div>';
  }
  btn(act, o) {
    const tip = encodeURIComponent(o.tip);
    return `<button class="cbtn ${o.off ? 'off' : ''} ${o.cls || ''}" data-act="${act}" ${Object.entries(o.data || {}).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')} data-tip="${tip}"><span class="g ${o.art || o.img ? 'art' : ''}">${o.img ? `<img src="${o.img}" alt="" draggable="false">` : o.art ? icon(o.art, o.glyph) : o.glyph}</span><span class="n">${esc(o.name)}</span>${o.sub ? `<span class="c">${o.sub}</span>` : ''}</button>`;
  }
  buildGrid() {
    const g = this.game, p = g.players[PLAYER];
    let html = `<div class="ctitle">Raise a building</div><div class="cgrid">`;
    const locked = [];
    for (const kind of BUILD_ORDER_UI) {
      const s = BUILDINGS[kind];
      const miss = g.missingFor(PLAYER, kind);
      if (miss.length) { locked.push(`${s.label.replace('Watchtower', 'Tower').replace('Archery Range', 'Archery')} (${miss.join(' + ')})`); continue; }   // not unlocked yet: hidden
      const afford = g.canAfford(PLAYER, s.cost);
      const tip = `<b>${s.label}</b><br><span class="info">${esc(s.info)}</span><br><span class="cost">${costText(s.cost, p)}</span> · ${s.time}s`;
      html += this.btn('place', { off: !afford, glyph: GLYPH[kind], art: kind, name: s.label.replace('Watchtower', 'Tower').replace('Archery Range', 'Archery'), sub: costShort(s.cost), data: { kind, slot: BUILD_ORDER_UI.indexOf(kind) }, tip });   // (slot: its place for Grid keys)
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
      const afford = g.canAfford(PLAYER, s.cost), room = s.nopop || g.popUsed(PLAYER) < g.popCap(PLAYER);   // (a pack animal needs no room)
      const needs = s.tech && !g.hasTech(PLAYER, s.tech) ? TECH[s.tech].label : null;   // a siege engine waits on its research
      const tip = `<b>${s.label}</b><br><span class="info">${esc(s.info)}</span><br>HP ${s.hp} · dmg ${s.dmg}${s.range > 1.6 ? ' (ranged)' : ''} · speed ${s.speed}<br><span class="cost">${costText(s.cost, p)}</span> · ${s.time}s${room ? '' : '<br><span class="need">Population capped: raise cottages.</span>'}`;
      html += this.btn('train', { off: !afford || !room || !!needs, glyph: GLYPH[k], art: k, name: s.label, sub: needs ? 'Locked' : costShort(s.cost), data: { kind: k }, tip: needs ? tip + `<br><span class='need'>Research <b>${needs}</b> at an academy first.</span>` : tip });
    }
    return html + `</div>`;
  }
  // the science division: three tiers of research; each tech's button says what it needs or does
  researchPanel() {
    const g = this.game, p = g.players[PLAYER];
    let html = `<div class="ctitle">Research (one at a time: learning from academies and scholars, silver for the deeper arts)</div>`;
    for (const tier of [1, 2, 3]) {
      html += `<div class="cgrid">`;
      for (const k of TECH_KEYS.filter((x) => TECH[x].tier === tier)) {
        const t = TECH[k], known = g.hasTech(PLAYER, k), cur = p.research === k, why = g.researchBlock(PLAYER, k);
        const sub = known ? 'known' : cur ? `${Math.min(100, Math.floor(((p.learning || 0) / t.cost.learning) * 100))}%` : `${t.cost.learning}L${t.cost.silver ? ` ${t.cost.silver}si` : ''}`;
        const tip = `<b>${t.label}</b> · tier ${tier}<br>${t.info}<br><span class="cost">${t.cost.learning} learning${t.cost.silver ? ` · ${t.cost.silver} silver` : ''}</span>${t.needs.length ? `<br><span class="info">Needs ${t.needs.map((x) => TECH[x].label).join(' and ')}</span>` : ''}${why && !known && !cur ? `<br><span class="need">${esc(why)}</span>` : ''}`;
        html += this.btn('research', { glyph: known ? '✓' : cur ? '…' : '✎', img: uiArt('tech', k), name: t.label, sub, off: !known && !cur && !!why, cls: known || cur ? 'on' : '', data: { tech: k }, tip });
      }
      html += `</div>`;
    }
    return html + `<div class="hint">Learning builds up even with nothing chosen (up to 300). More academies and scholars beside them study faster; abbeys you hold help.</div>`;
  }
  // the armoury: order kit (paid at once), see what is in hand, cancel for a refund
  armouryPanel(b) {
    const g = this.game, p = g.players[PLAYER];
    let html = `<div class="ctitle">Make (${(b.craft || []).length}/${CRAFT_QUEUE} in hand)</div><div class="cgrid">`;
    for (const k of GEAR_KEYS) {
      const it = GEAR[k], why = g.craftBlock(PLAYER, b, k), locked = !g.hasTech(PLAYER, it.tech);
      const tip = `<b>${it.label}</b> · ${it.slot}<br>${it.info}<br><span class="info">For ${it.for.join(', ')}s.${locked ? ` Research ${TECH[it.tech].label} to make them.` : ''}</span><br><span class="cost">${costText(it.cost, p)}</span> · ${it.time}s<br>In store: ${p.gear?.[k] || 0}`;
      html += this.btn('craft', { glyph: locked ? '🔒' : '⛨', img: uiArt('gear', k), name: it.label, sub: locked ? TECH[it.tech].label : costShort(it.cost), off: !!why, data: { item: k }, tip });
    }
    html += `</div>`;
    if (b.craft?.length) html += `<div class="qrow">${b.craft.map((q, i) => `<div class="qslot" data-act="uncraft" data-i="${i}" data-tip="${encodeURIComponent(`<b>${GEAR[q.item].label}</b><br>Click to cancel (refund).`)}">${uiImg('gear', q.item, '⛨', 'qico')}${i === 0 ? `<i style="width:${(q.t / GEAR[q.item].time) * 100}%"></i>` : ''}</div>`).join('')}</div>`;
    return html + `<div class="hint">Kit goes into your stockpile. New soldiers take the best for their kind; soldiers standing idle within 7 tiles of an Armoury swap up and hand the old kit back.</div>`;
  }
  stanceGrid(us) {
    const g = this.game, fs = us.filter((u) => g.fighter(u) || u.kind === 'king'), cur = new Set(fs.map((u) => g.stanceOf(u)));
    const glyph = { aggressive: '⚔', defensive: '⛨', hold: '⚓', passive: '☮' };
    const tip = {
      aggressive: '<b>Aggressive</b><br>Engage any foe that comes in sight and chase it down.',
      defensive: `<b>Defensive</b><br>Engage foes that come near, but break off a chase more than ${STANCE.leash} tiles from where it began and come back.`,
      hold: '<b>Hold ground</b><br>Never step off the spot to fight: strike only what comes within reach.',
      passive: '<b>No attack</b><br>Never start a fight (a soldier already locked in combat still cannot run). Your orders still go.',
    };
    return `<div class="ctitle">Stance</div><div class="cgrid c4">${STANCES.map((k) => this.btn('stance', { glyph: glyph[k], img: uiArt('orders', k), name: STANCE.label[k], cls: cur.size === 1 && cur.has(k) ? 'on' : '', data: { stance: k }, tip: tip[k] })).join('')}</div>`;
  }
  // formations (T02): how the group stands at the end of a march; shown for a group, kept by each member
  formationGrid(us) {
    const g = this.game, cur = g.formOf(us);
    const glyph = { mass: '◉', line: '☰', box: '▣', loose: '⁘' };
    const tip = {
      mass: '<b>Mass</b><br>Gather in a tight knot at the spot.',
      line: '<b>Line</b><br>Form ranks across the line of march: footmen and riders in front, bowmen behind. Faces the way it marched.',
      box: '<b>Box</b><br>Form a square: fighters on the edge, bowmen and the weak inside.',
      loose: '<b>Loose</b><br>Spread out wide, so fewer stand in the way of one blow or volley.',
    };
    const after = '<br><span class="info">Kept for the group\'s next marches. Those standing idle form up at once.</span>';
    return `<div class="ctitle">Formation</div><div class="cgrid c4">${FORMATIONS.map((k) => this.btn('formation', { glyph: glyph[k], img: uiArt('orders', k), name: FORMATION.label[k], cls: cur === k ? 'on' : '', data: { form: k }, tip: tip[k] + after })).join('')}</div>`;
  }
  captainBtn(us) {
    if (us.length !== 1) return '';
    const u = us[0], g = this.game;
    if (u.captain || !['footman', 'bowman', 'knight'].includes(u.kind)) return '';
    const n = g.units.filter((x) => x.team === PLAYER && x.captain && x.hp > 0).length, ok = (u.rank || 0) >= CAPTAIN.minRank && n < CAPTAIN.max && g.canAfford(PLAYER, CAPTAIN.cost);
    return this.btn('captain', { glyph: '⚑', name: 'Make captain', sub: CAPTAIN.cost.gold + 'c', off: !ok, tip: `<b>Make captain</b><br>Soldiers within ${CAPTAIN.aura} tiles hit ${Math.round(CAPTAIN.dmg * 100)}% harder and learn ${Math.round(CAPTAIN.xp * 100)}% faster; a captain on guard counts half again. Needs an ${RANKS[CAPTAIN.minRank].label} or better; ${n}/${CAPTAIN.max} captains.<br><span class="cost">${CAPTAIN.cost.gold} coin</span>` });
  }
  rosterPanel(b) {
    const g = this.game, p = g.players[PLAYER], room = g.popUsed(PLAYER) < g.popCap(PLAYER);   // (a hire needs room: a cottage gives five)
    let html = `<div class="ctitle">Wanderers for hire (new faces every ${Math.round(120 / 60)} min)</div><div class="cgrid">`;
    b.roster.forEach((w, i) => {
      const far = w.far ? FARLANDS[w.far] : null, t = TRAITS[w.trait], afford = g.canAfford(PLAYER, w.cost);
      if (far) { html += this.btn('hire', { off: !afford || !room, glyph: '✦', art: 'recruit', img: uiArt('portraits', w.far), name: `${w.name.split(' ')[0]}`, sub: `${far.perk} · ${costShort(w.cost)}`, data: { i }, cls: 'far', tip: `<b>${esc(w.name)}</b><br>${esc(far.label)} from ${esc(far.land)}. A traveller of a people with no house in the valley.<br><b>${far.perk}</b>: ${far.tip}<br><span class="info">Starts Trained. Keeps the gift when drilled into a soldier.</span><br><span class="cost">${costText(w.cost, p)}</span>` }); return; }
      const tip = `<b>${esc(w.name)}</b> · ${t.label}<br><span class="info">${t.hp > 1 ? `+${Math.round((t.hp - 1) * 100)}% health. ` : ''}${t.dmg ? `+${t.dmg} damage. ` : ''}${t.spd ? `Faster. ` : ''}${w.trait === 'green' ? 'Untrained but cheap.' : ''}Drill them in a keep to make a soldier.</span><br><span class="cost">${costText(w.cost, p)}</span>`;
      html += this.btn('hire', { off: !afford || !room, glyph: '☗', art: 'recruit', name: `${w.name}`, sub: room ? `${t.label} · ${costShort(w.cost)}` : 'No room: raise a cottage', data: { i }, tip });
    });
    if (!room) html += `</div><div class="hint need">Your population is full (${g.popUsed(PLAYER)}/${g.popCap(PLAYER)}): every serf, soldier and recruit takes a place. Raise a <b>cottage</b> (+5) to hire more.`;
    return html + `</div><div class="hint">Hired wanderers walk to the rally point (right-click ground). Right-click a keep with them to garrison and drill.</div>`;
  }
  // the town bell (T38): the first ring shelters the serfs, the second sends them back to work
  ringBell() {
    const r = this.host.send({ type: 'bell' });
    if (!r && this.game.diploNote) this.toast(this.game.diploNote, 'warn');
    this.sigCmd = ''; this.hudT = 0;
  }
  bellBtn() {
    const on = this.game.players[PLAYER].bell != null, k = this.gridKeys ? '' : keyName(this.kmap.bell);
    return this.btn('bell', { img: uiArt('orders', 'bell'), glyph: '🔔', name: on ? 'All clear' : 'Town bell', sub: k, cls: on ? 'on' : '', tip: on ? `<b>All clear</b> ${k ? `(${k})` : ''}<br>Everyone the bell sent inside comes out and goes back to the work they left.` : `<b>Town bell</b> ${k ? `(${k})` : ''}<br>Every serf and scholar within ${BELL.r} tiles of a keep, tower, barracks or village you hold runs inside the nearest one with room; a keep shoots one arrow for every ${KEEP_ARROWS.per} inside. Ring again for the all-clear.` });
  }
  keepPanel(b) {
    const g = this.game, p = g.players[PLAYER];
    let html = `<div class="ctitle">Drill garrisoned recruits and serfs</div><div class="cgrid">`;
    for (const k of Object.keys(DRILL)) {
      const d = DRILL[k], afford = g.canAfford(PLAYER, d.cost);
      html += this.btn('drill', { off: !afford, glyph: GLYPH[k], art: k, name: UNITS[k].label, sub: `${costShort(d.cost)} · ${d.time}s`, data: { kind: k }, tip: `<b>Drill a ${UNITS[k].label.toLowerCase()}</b><br><span class="info">Turns the highlighted garrisoned recruit or serf (else the first one) into a ${UNITS[k].label.toLowerCase()}. Keeps their traits.</span><br><span class="cost">${costText(d.cost, p)}</span>` });
    }
    html += this.btn('leave', { glyph: '⇥', name: 'Leave', tip: '<b>Leave</b><br>Everyone steps out.' });
    html += this.bellBtn();
    return html + `</div><div class="hint">Right-click the keep with units to garrison them, or a village you hold to <b>levy villagers</b>.</div>`;
  }
  treatyRows() {
    const g = this.game; let html = '';
    for (let i = 0; i < g.houses; i++) {
      if (i === PLAYER || !g.alive(i)) continue;
      const rel = g.rel[PLAYER][i], known = g.known[PLAYER][i], pend = g.offers.some((o) => o.from === PLAYER && o.to === i && o.state === 'trade') || (g.asks || []).some((x) => x.from === PLAYER && x.to === i);
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
  // a rival's house as seen from a click on one of their units or buildings: where you stand, their ruler's temper and opinion of you
  foeRow(team) {
    const g = this.game; if (team == null || team < 0 || team === PLAYER) return '';
    const rel = g.rel[PLAYER][team], op = Math.round(g.opinion?.[team]?.[PLAYER] || 0), t = TEMPERS.find((x) => x.key === g.players[team]?.persona?.temper), k = g.kingOf(team);
    return `<div class="stat"><label>House</label><span>${esc(HOUSES[team].name)} · <b class="rel ${rel}" style="padding:0 5px;border-radius:2px">${rel}</b> · thinks of you <b>${op > 0 ? '+' : ''}${op}</b></span></div>`
      + (k ? `<div class="stat"><label>Ruler</label><span>${esc(k.title)} ${esc(k.name)}${t ? ` · <span data-tip="${encodeURIComponent(`<b>${t.label}</b><br>${t.tip}`)}">${t.label}</span>` : ''}</span></div>` : '');
  }
  // what makes this person who they are: far-land gift, captaincy, deeds, service record
  characterRows(u) {
    const g = this.game, far = u.far ? FARLANDS[u.far] : null; let h = '';
    if (far) h += `<div class="stat"><label>Gift</label><span data-tip="${encodeURIComponent(`<b>${far.perk}</b><br>${far.tip}`)}"><b>${esc(far.perk)}</b>: ${esc(far.tip)}</span></div>`;
    if (u.gear && (u.gear.weapon || u.gear.armour)) h += `<div class="stat"><label>Kit</label><span>${[u.gear.weapon, u.gear.armour].filter(Boolean).map((k) => `<span data-tip="${encodeURIComponent(`<b>${GEAR[k].label}</b><br>${GEAR[k].info}`)}">${uiImg('gear', k)}${esc(GEAR[k].label.replace(/s$/, ''))}</span>`).join(' · ')}</span></div>`;
    else if (['footman', 'bowman', 'knight'].includes(u.kind) && u.team === PLAYER) h += `<div class="stat"><label>Kit</label><span style="opacity:.7">plain issue: an Armoury makes better</span></div>`;
    if (u.kind === 'king') { const hp = g.players[u.team], n = hp.heirs ?? 2; h += `<div class="stat"><label>Line</label><span>${n ? `${n} heir${n === 1 ? '' : 's'} after him` : '<b style="color:#e0866a">the last of the line: if he dies, the house falls</b>'}${g.seatOf(u.team) ? '' : ` · ${uiImg('marks', 'fugitive')}a fugitive: every house can see him`}</span></div>`; }
    if (u.captain) h += `<div class="stat"><label>Command</label><span>${uiImg('marks', 'captain')}Captain: soldiers within ${CAPTAIN.aura} tiles +${Math.round(CAPTAIN.dmg * 100)}% damage, +${Math.round(CAPTAIN.xp * 100)}% experience</span></div>`;
    if (u.deeds?.length) h += `<div class="chips">${u.deeds.map((d) => `<span class="chip" data-tip="${encodeURIComponent(`<b>${DEEDS[d].label}</b><br>${DEEDS[d].tip}`)}">${uiImg('marks', d)}${esc(DEEDS[d].label)}</span>`).join('')}</div>`;
    if (u.kind !== 'camel' && u.kind !== 'serf') {
      const from = u.from != null ? g.byId.get(u.from) : null, served = Math.max(0, g.time - (u.born ?? g.time));
      h += `<div class="stat"><label>Record</label><span>${u.kills || 0} kill${u.kills === 1 ? '' : 's'}${u.razed ? ` · ${u.razed} building${u.razed === 1 ? '' : 's'} razed` : ''} · served ${served < 60 ? 'under a minute' : Math.floor(served / 60) + ' min'}${from ? ` · raised at a ${BUILDINGS[from.kind].label.toLowerCase()}` : ''}</span></div>`;
    }
    return h;
  }
  // living units first raised by building b, best first
  rollOf(b) {
    return this.game.units.filter((u) => u.from === b.id && u.team === b.team && u.hp > 0).sort((a, c) => (c.rank || 0) - (a.rank || 0) || (c.xp || 0) - (a.xp || 0));
  }
  // one chip per person: name, rank chevrons, captaincy, health; click to select them
  rollChips(list, max) {
    if (!list.length) return '';
    const g = this.game, chev = (r) => (r ? '›'.repeat(r) : '');
    const chips = list.slice(0, max).map((u) => {
      const st = UNITS[u.kind], far = u.far ? FARLANDS[u.far] : null, pct = Math.round((u.hp / u.maxHp) * 100);
      const tip = `<b>${esc(u.name || st.label)}</b>${u.captain ? ' · Captain' : ''}<br>${st.label}${g.ranked(u) ? ' · ' + RANKS[u.rank || 0].label : ''}${far ? ' · ' + esc(far.label) : ''}<br>${Math.ceil(u.hp)}/${u.maxHp} health · ${u.kills || 0} kills${u.deeds?.length ? '<br>' + u.deeds.map((d) => DEEDS[d].label).join(', ') : ''}${u.inside ? '<br>Inside' : ''}<br>Click to select.`;
      return `<span class="chip x" data-act="select" data-id="${u.id}" data-tip="${encodeURIComponent(tip)}" style="${pct < 40 ? 'border-color:#c4533a' : ''}">${GLYPH[u.kind]?.length === 1 ? GLYPH[u.kind] : ''} ${esc((u.name || st.label).split(' ')[0])}${u.captain ? ' ⚑' : ''}${far ? ' ✦' : ''} <b style="color:#e8c35a">${chev(u.rank || 0)}</b></span>`;
    }).join('');
    return `<div class="chips">${chips}${list.length > max ? `<span class="chip">+${list.length - max} more</span>` : ''}</div>`;
  }
  rankRow(u) {
    const r = u.rank || 0, nxt = RANKS[r + 1], lo = RANKS[r].xp, pct = nxt ? Math.min(100, (((u.xp || 0) - lo) / (nxt.xp - lo)) * 100) : 100;
    return `<div class="stat" data-tip="${encodeURIComponent(`<b>${RANKS[r].label}</b><br>+${Math.round(RANK_BONUS.dmg * r * 100)}% damage, +${Math.round(RANK_BONUS.hp * r * 100)}% health. Experience comes from wounding and killing foes. A rated soldier on guard counts for ${(1 + RANK_BONUS.guard * r).toFixed(2)} when a keep or village is swaying its neighbours.`)}"><label>Rank</label><span style="color:#e2c15e">${'▲'.repeat(r) || '·'} ${RANKS[r].label}</span><div class="meter"><i class="ore" style="width:${pct}%"></i></div><span class="v">${nxt ? Math.floor(u.xp || 0) + '/' + nxt.xp : 'max'}</span></div>`;
  }
  crewHtml(b) {
    const g = this.game, c = g.crewOf(b);
    if (!c) return '';
    if (!c.n) return `<div class="stat"><label>Diggers</label><span class="need">none: ${c.villages ? 'the villages in reach have no hands to spare' : `no village within ${MINE_JOBS.r} tiles`}</span></div>`;
    const rows = c.list.map((e) => `${e.n} from ${esc(e.v.name)}${e.own ? ' (yours, +' + Math.round((MINE_JOBS.ownBonus - 1) * 100) + '%)' : ''}`).join(', ');
    return `<div class="stat"><label>Diggers</label><span>${c.n}/${MINE_MAX_WORKERS} · yield ×${c.power.toFixed(2)}</span></div><div class="hint">${rows}. Their goodwill drifts to you.</div>`;
  }
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
    html += `<div class="hint">Train a <b>camel</b>, select it, then click markets (or use the loop buttons): it circles them for ever. Trade so far: <b>+${Math.floor(me.tradeEarned || 0)} coin</b> over ${me.trips || 0} trips.</div></div></div>`;
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
    html += `<div class="hint">${chk.own ? 'A camel moves goods here from where they are plentiful; townsfolk pay for what is scarce.' : `Coin in their purse: <b>${g.availFor(t, 'gold')}</b>.`} ${have.length ? 'On the shelf:' : 'The shelf is empty.'}</div>`;
    if (have.length) html += `<div class="goods">${have.map((k) => `<span class="gchip" data-tip="${encodeURIComponent(`<b>${GOOD_LABEL[k]}</b><br>Pays ${g.priceAt(t, k).toFixed(1)} each (worth ${RES_VALUE[k]})`)}">${dot(k)}${GOOD_LABEL[k]} ${g.stockOf(t, k)} · ${g.priceAt(t, k).toFixed(1)}</span>`).join('')}</div>`;
    const camels = g.units.filter((u) => u.team === PLAYER && u.kind === 'camel' && u.hp > 0);
    html += `<div class="ctitle">Send a camel (it keeps up to ${ROUTE_STOPS} markets on a loop)</div>`;
    if (!camels.length) return html + `<div class="hint">Train a camel at one of your markets first.</div>`;
    const busy = (u) => (u.route?.stops?.length ? 1 : 0);
    const rows = camels.slice().sort((a, b) => busy(a) - busy(b) || Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y)).slice(0, 9);
    html += `<div class="cgrid">${rows.map((u) => {
      const home = g.routeHome(u), on = u.route?.stops?.includes(t.id), full = !on && (u.route?.stops?.length || 0) >= ROUTE_STOPS;
      const isHome = home && home.id === t.id, q = home && !isHome ? g.quoteStop(home, t) : null;
      const sub = on ? 'on its loop · click to remove' : isHome ? 'its home market' : full ? `already has ${ROUTE_STOPS} markets` : q && q.n >= 1 ? (chk.own ? 'moves goods here' : `+${Math.floor(q.profit)} coin a trip`) : 'little to carry yet';
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
  // a camel's loop: its markets, what each leg is worth, what it is doing now, and how to change the route
  camelPanel(us) {
    const g = this.game, u = us[0], single = us.length === 1, r = u.route, circ = g.circuitOf(u), stops = circ.slice(1);
    const home = circ[0], total = g.goodsTotal(u), kinds = (items) => Object.entries(items || {}).filter(([, n]) => n >= 1).map(([k, n]) => `${Math.round(n)} ${GOOD_LABEL[k].toLowerCase()}`).join(', ');
    let html = `<div class="ctitle">${single ? esc(u.name || 'Camel') : us.length + ' camels'} · loop of ${stops.length}/${ROUTE_STOPS} markets${single ? ` · carrying ${Math.floor(total)}/${CAMEL_CAP}${u.cargo?.gold ? ` + ${Math.floor(u.cargo.gold)} coin` : ''}` : ''}</div>`;
    if (!home) html += `<div class="hint">Raise a market first: a camel works out of one of yours.</div>`;
    else html += `<div class="hint">Starts and ends at <b>${esc(HOUSES[PLAYER].short)}'s market</b> (${Math.round(Math.hypot(u.x - home.x, u.y - home.y))} tiles away). It never stops: at each market it unloads, loads for the next, and trades both ways with treaty partners.</div>`;
    html += `<div class="cgrid c4">${this.btn('routeauto', { glyph: '⟲', name: 'All my markets', data: { mode: 'own' }, tip: '<b>Loop all my markets</b><br>The camel circles every market you own, nearest first, moving goods from where mines, foundries and warehouses stock them to where they are scarce. Townsfolk pay for what arrives.' })}${this.btn('routeauto', { glyph: '⇄', name: 'Trade partners', data: { mode: 'partners' }, tip: '<b>Loop to trade partners</b><br>The camel runs between your market and the best treaty-partner markets, selling your goods for coin and buying their cheap goods to bring home.' })}${stops.length ? this.btn('stopgo', { glyph: '■', name: 'Stop loop', tip: '<b>Stop loop</b><br>Finish up and come home; clears every stop.' }) : ''}</div>`;
    if (stops.length) {
      html += `<div class="stoplist">${stops.map((m, i) => {
        const prev = circ[i], q = g.legQuote(PLAYER, prev, m, 100), own = m.team === PLAYER, here = single && r.i === i + 1;
        return `<div class="stoprow ${here ? 'cur' : ''}"><span class="sn">${i + 1}. ${esc(g.stopName(m))}</span><span class="st">${q.n >= 1 ? `${own ? 'carries' : 'sells'} ~${Math.round(q.profit)} coin/trip` : 'little to carry yet'}</span><button class="cbtn mini" data-act="routestop" data-market="${m.id}" data-tip="${encodeURIComponent('<b>Remove this stop</b>')}">×</button></div>`;
      }).join('')}</div>`;
      if (single) {
        const dest = circ[r.i], leg = r.leg && r.leg.to === dest?.id ? r.leg : null;
        html += `<div class="hint">${r.laps || 0} laps, <b>+${Math.floor(r.earned)} coin</b> from trade. ${u.task.stage === 'dwell' ? 'Trading at the market.' : `On its way to <b>${dest ? esc(g.stopName(dest)) : 'a market'}</b>.`} ${leg && leg.n >= 1 ? `Carrying ${esc(kinds(leg.items))}${leg.profit >= 1 ? `, about +${Math.round(leg.profit)} coin` : ''}.` : 'Nothing worth carrying on this leg yet; it keeps walking the loop and will pick up goods as shelves fill.'}</div>`;
      }
    }
    html += stops.length < ROUTE_STOPS ? `<div class="hint">Or <b>click a market</b> on the map to add it to the loop (yours, or a treaty partner's). Click one of its stops again to remove it.</div>` : `<div class="hint">The loop is full (${ROUTE_STOPS} markets). Click a stop's × to swap one.</div>`;
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
      html += this.btn('draft', { glyph: GLYPH.serf, art: 'serf', name: 'Serf', sub: SETTLE_FOOD + 'g', data: { role: 'serf', n: 1 }, off: free < 1 || room < 1 || food < SETTLE_FOOD, tip: `<b>Draft a serf</b><br>One villager becomes a serf of yours (${SETTLE_FOOD} grain). Serfs gather and build.` });
      html += this.btn('draft', { glyph: GLYPH.serf, art: 'serf', name: 'Serfs ×5', sub: SETTLE_FOOD * 5 + 'g', data: { role: 'serf', n: 5 }, off: free < 1 || room < 1 || food < SETTLE_FOOD, tip: `<b>Draft serfs</b><br>Up to five villagers leave as serfs (${SETTLE_FOOD} grain each). They regrow while the village has grain.` });
      { const wait = Math.max(0, Math.ceil((v.armAt ?? -1e9) + DRAFT.armEvery - g.time)); html += this.btn('draft', { glyph: '⚔', art: 'recruit', name: 'Arm villager', sub: wait ? `${wait}s` : `${DRAFT.soldierFood}g`, data: { role: 'soldier', n: 1 }, off: free < 1 || room < 1 || food < DRAFT.soldierFood || wait > 0, tip: `<b>Arm a villager</b><br>One villager takes up a spear: a recruit who fights at about a quarter of a footman's strength. A village can arm one every ${DRAFT.armEvery}s. For real soldiers train them at a barracks, or put recruits in a keep and drill them.<br><span class="cost">${DRAFT.soldierFood} grain</span>` }); }
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
      const kn = (id) => (this.gridKeys ? '' : keyName(this.kmap[id]));   // (the key each order is bound to now, T03; with Grid keys on, the key in the corner says it)
      html += `<div class="cgrid c4" style="margin-top:6px">${this.btn('stop', { img: uiArt('orders', 'stop'), glyph: '■', name: 'Stop', sub: kn('stop'), tip: `<b>Stop</b> ${this.gridKeys ? '' : `(${kn('stop')})`}<br>Halt and hold position.`, cls: '' })}${us.some((u) => g.fighter(u)) ? this.btn('amove', { img: uiArt('orders', 'amove'), glyph: '⚔', name: 'Attack-move', sub: kn('amove'), cls: this.amove ? 'on' : '', tip: `<b>Attack-move</b> (${this.gridKeys ? '' : `${kn('amove')}, or `}Ctrl+right-click)`+'<br>Click the ground: they march there and fight every foe they meet on the way. Hold <b>Shift</b> to add more legs.' }) : ''}${us.some((u) => g.fighter(u)) ? this.btn('patrol', { img: uiArt('orders', 'patrol'), glyph: '⟲', name: 'Patrol', sub: kn('patrol'), cls: this.patrolArm ? 'on' : '', tip: `<b>Patrol</b> ${this.gridKeys ? '' : `(${kn('patrol')})`}`+'<br>Click the ground: they walk there and back for ever, fighting every foe they meet and walking on. Hold <b>Shift</b> to add more posts to the round. Any other order ends it.' }) : ''}${us.some((u) => g.fighter(u)) ? this.btn('charge', { img: uiArt('orders', 'charge'), glyph: '⚑', name: 'Attack', sub: kn('charge'), cls: '', tip: `<b>Attack</b> ${this.gridKeys ? '' : `(${kn('charge')})`}`+'<br>Fall on the nearest foe in sight: soldiers first, then their buildings, then a village of a house you are at war with.' }) : ''}${us.some((u) => g.fighter(u) || u.kind === 'king') ? this.btn('retreat', { img: uiArt('orders', 'retreat'), glyph: '↩', name: 'Retreat', sub: kn('retreat'), cls: '', tip: `<b>Retreat</b> ${this.gridKeys ? '' : `(${kn('retreat')})`}`+'<br>Off the field to your nearest keep, even out of a fight. <span class=\'need\'>If three or more of them (or your king) were fighting, it is a rout: every village of yours loses a fifth of its loyalty, slow to come back for three minutes, and the other houses smell weakness.</span>' }) : ''}${this.captainBtn(us)}</div>`;
      if (us.some((u) => g.fighter(u))) html += `<div class="hint"><b>Shift</b>+right-click adds waypoints to a march; a group keeps to its slowest member's pace.</div>`;
      if (us.some((u) => g.fighter(u) || u.kind === 'king')) html += this.stanceGrid(us);
      const marchers = us.filter((u) => u.kind !== 'camel');
      if (marchers.length > 1 && marchers.some((u) => g.fighter(u) || u.kind === 'king')) html += this.formationGrid(marchers);
      if (us.some((u) => u.kind === 'spy' && u.team === PLAYER)) html += this.disguiseGrid(us.filter((u) => u.kind === 'spy'));
      if (us.some((u) => u.kind === 'camel')) html += this.camelPanel(us.filter((u) => u.kind === 'camel'));
      if (us.some((u) => u.kind === 'recruit')) html += `<div class="ctitle">Role</div><div class="cgrid c4">${this.btn('spy', { glyph: GLYPH.spy, art: 'spy', name: 'Become spy', sub: SPY_FEE + 'c', off: g.players[PLAYER].gold < SPY_FEE, tip: `<b>Become a spy</b><br>${SPY_FEE} coin. Spies right-click an independent or rival village to sway its loyalty (and can be caught).` })}</div><div class="hint">Or right-click a keep to garrison, then drill into a soldier.</div>`;
      if (us.some((u) => u.kind === 'serf')) html += `<div class="hint">Right-click: a deposit with a <b>mine</b> to dig, timber, berries or gold to gather, a building site to build.</div>`;
      if (!us.some((u) => u.kind === 'serf' || u.kind === 'camel' || u.kind === 'recruit')) {
        const sp = us.some((u) => u.kind === 'spy');
        html += `<div class="hint">Right-click: <b>move</b>, <b>attack</b> a foe, <b>sack</b> a village${sp ? ', or send the <b>spy</b> in to turn its loyalty' : ''}. Right-click your own <b>keep, tower, barracks</b> or a village you hold to go <b>inside</b>${sp ? ' (a spy keeps <b>watch</b> there)' : ''}. Attacking a house at peace declares war. <b>${keyName(this.kmap.amove)}</b> then a click (or Ctrl+right-click) <b>attack-moves</b>.</div>`;
      }
    } else if (ent && ent.type === 'building' && ent.team === PLAYER) {
      if (ent.built < 1) html = `<div class="hint">Under construction. Select serfs and right-click this building to help raise it.</div><div class="cgrid" style="margin-top:6px">${this.btn('demolish', { glyph: '✕', name: 'Cancel site', sub: '80% back', cls: this.demoArm === ent.id ? 'on' : '', tip: '<b>Cancel the site</b><br>Click twice. Four fifths of the cost comes back.' })}</div>`;
      else {
        html += this.trainGrid(ent);
        if (ent.kind === 'market') html += this.marketPanel(ent);
        if (ent.kind === 'tavern' && ent.roster) html += this.rosterPanel(ent);
        if (ent.kind === 'academy') html += this.researchPanel();
        if (ent.kind === 'armoury') html += this.armouryPanel(ent);
        { const roll = this.rollOf(ent); if (roll.length > 1) html += `<div class="cgrid" style="margin-top:6px">${this.btn('selroll', { glyph: '☰', name: 'Select roll', sub: `${roll.filter((u) => !u.inside).length} outside`, tip: '<b>Select the muster roll</b><br>Selects everyone raised here who is out in the field.' })}</div>`; }
        if (ent.kind === 'keep') html += this.keepPanel(ent);
        else if (GARRISON[ent.kind] && ent.garrison.length) html += `<div class="cgrid" style="margin-top:6px">${this.btn('leave', { glyph: '⇥', name: 'Leave', tip: '<b>Leave</b><br>Everyone steps out.' })}</div>`;
        if (ent.kind === 'mine') html += `<div class="hint">Local villagers dig for you: no villages in reach means no workers. Your own villages work harder. Ore goes straight into your stockpile.</div>`;
        if (ent.kind === 'mine' || ent.kind === 'foundry') html += this.chainLine(ent);
        if (ent.kind === 'warehouse') { const st = Object.entries(ent.stock || {}).filter(([, n]) => n >= 1); html += `<div class="hint">Holds what the markets within ${MARKET_RADIUS} tiles cannot shelve, and refills them as they empty: ${st.length ? st.map(([k, n]) => `<b>${Math.floor(n)}</b> ${GOOD_LABEL[k].toLowerCase()}`).join(', ') : 'empty so far'} (up to ${WAREHOUSE_CAP} of each).</div>`; }
        if (ent.kind === 'foundry') html += `<div class="hint">Smelts on its own from your stockpile: <b>iron + coal → steel</b> (forges turn it into arms), <b>copper + coal → fine ware</b> (content villages). Sell the surplus through a market's camels.</div>`;
        if (ent.kind === 'keep') html += this.buildGrid();
        if (!html) html = `<div class="hint">${esc(BUILDINGS[ent.kind].info)}</div>`;
        else if (Object.values(UNITS).some((u) => u.from.includes(ent.kind))) html += `<div class="hint">Right-click the field to set a <b>rally point</b>; on a resource, new serfs gather it.</div>`;
        html += `<div class="cgrid" style="margin-top:6px">${ent.hp < ent.maxHp ? this.btn('repair', { img: uiArt('orders', 'repair'), glyph: '🔨', name: 'Repair', sub: `${Math.round((100 * ent.hp) / ent.maxHp)}%`, tip: `<b>Repair</b><br>Sends the nearest four serfs to mend it. Repairs cost half the price of the health put back, paid as they work (grain, timber, coin or stone as the building needs). You can also select serfs and right-click it.` }) : ''}${this.btn('demolish', { glyph: '⚒', name: 'Pull down', sub: '30% back', cls: this.demoArm === ent.id ? 'on' : '', tip: '<b>Pull down</b><br>Click twice. Those inside step out and a third of its cost comes back. A keep or temple pulled down stops swaying the villages around it.' })}</div>`;
      }
    } else if (ent && ent.type === 'village') {
      html = this.villageActs(ent) + this.tradeBoard(ent) + `<div class="hint">${ent.owner === PLAYER ? 'Yours: right-click with soldiers to garrison. Select a keep and right-click it to <b>levy</b> villagers.' : 'Win it by <b>sack</b> (soldiers), <b>influence</b> (a keep with soldiers inside, plus a temple, tavern or market near it) or a <b>spy</b>.'}</div>`;
    } else if (ent && ent.type === 'building') {
      const army = g.militaryOf(PLAYER).length;
      html = `<div class="ctitle">Options</div><div class="cgrid">${this.btn('sendarmyb', { glyph: '⚔', name: 'Attack', off: !army, sub: army ? `${army} soldiers` : '', tip: '<b>Attack</b><br>Sends every soldier at it. Or select units and right-click it (rams are best against walls).' })}${ent.team >= 0 && ent.team !== PLAYER ? this.btn('council', { glyph: '⚜', name: 'Council', data: { team: ent.team }, tip: '<b>Council of Houses</b><br>Everything about this house and every dealing with it.' }) : ''}</div>${ent.kind === 'market' ? this.tradeBoard(ent) : ''}<div class="hint">${esc(HOUSES[ent.team].name)} building. Select units and right-click it to attack.</div>`;
    } else if (s.type === 'units' && this.selUnits().length) {
      const t = this.selUnits()[0].team;
      html = `<div class="ctitle">${esc(HOUSES[t].name)}</div><div class="cgrid">${this.btn('council', { glyph: '⚜', name: 'Council', data: { team: t }, tip: `<b>Council of Houses</b><br>Their strength, wealth and temper, and every dealing with them: peace, trade, alliance, gifts, war.` })}</div>`;
    } else if (s.type === 'node' && g.resources[s.id]) {
      const n = g.resources[s.id], mined = MINEABLE.includes(n.kind), hasMine = mined && g.buildings.some((b) => b.kind === 'mine' && b.hp > 0 && b.nodeIds?.includes(n.id));
      html = `<div class="ctitle">Options</div><div class="cgrid">${mined && !hasMine ? this.btn('minehere', { glyph: '⛏', art: 'mine', name: 'Build mine', sub: costShort(BUILDINGS.mine.cost), off: !g.canAfford(PLAYER, BUILDINGS.mine.cost), tip: `<b>Mine</b><br>Raised beside the deposit; then assign serfs. <span class="cost">${costText(BUILDINGS.mine.cost, g.players[PLAYER])}</span>` }) : ''}${!mined ? this.btn('gathernode', { glyph: '⚒', name: 'Gather', sub: '4 idle serfs', tip: '<b>Gather</b><br>Sends up to four idle serfs.' }) : ''}</div><div class="hint">${mined ? (hasMine ? 'A mine stands here: select it to send diggers.' : 'Ore needs a <b>Mine</b>. Once built, serfs dig it into your stockpile.') : 'Select serfs and right-click to gather.'}</div>`;
    } else {
      html = `<div class="hint">Press <b>${keyName(this.kmap.hall)}</b> for your home village: <b>draft serfs</b> and <b>raise buildings</b>. Right-click timber, berries or gold with serfs to gather. <b>${keyName(this.kmap.campaign)}</b> opens the campaign map.</div>`;
    }
    if (html !== this.sigCmd) { this.sigCmd = html; $('cmdPanel').innerHTML = packWords(html, PLAYER); this.labelGrid(); }
  }
  // Grid keys: give each button of the card its key and show it in the corner. Per-person buttons (a serf's row) are left out.
  // A fighting card keeps AoE IV's rows: orders on Q W E R (Stop, Attack-move, Attack, Retreat), stances on A S D F, formations on
  // Z X C V; anything else (captain, disguise, the build menu) takes the Shift page. When the build menu leads a card with no stances
  // (serfs), every building keeps its own key, and the keys of those still locked are kept free for them.
  labelGrid() {
    this.gridMap = [];
    if (!this.gridKeys) return;
    const bs = [...$('cmdPanel').querySelectorAll('.cbtn:not([data-id])')];
    const fight = bs.some((b) => b.dataset.act === 'stance'), lead = !fight && bs[0]?.dataset.slot != null;
    const ORDER = ['stop', 'amove', 'charge', 'retreat'];
    const own = (b) => {
      if (fight) { const d = b.dataset; return ORDER.includes(d.act) ? ORDER.indexOf(d.act) : d.act === 'stance' ? 4 + STANCES.indexOf(d.stance) : d.act === 'formation' ? 8 + FORMATIONS.indexOf(d.form ?? d.formation) : null; }
      return lead && b.dataset.slot != null ? +b.dataset.slot : null;
    };
    const slots = assignGrid(bs.map(own), fight ? [...Array(12).keys()] : lead ? BUILD_ORDER_UI.map((_, i) => i) : []);
    bs.forEach((b, i) => { const sl = slots[i]; if (sl < 0) return; this.gridMap[sl] = b; b.insertAdjacentHTML('beforeend', `<span class="hk">${gridLabel(sl)}</span>`); });
  }
  gridBtn(slot) { const b = slot >= 0 ? this.gridMap[slot] : null; return b && b.isConnected ? b : null; }
  setGridKeys(on) {
    this.gridKeys = !!on;
    if (!saveGrid(this.keyStore, this.gridKeys)) this.toast('Could not remember that in this browser; it lasts until you close the tab.', 'warn');
    this.applyKeys();
    this.toast(this.gridKeys ? 'Grid keys on: Q W E R / A S D F / Z X C V press the command card by place (Shift for the second page); the arrows pan.' : 'Grid keys off.', 'info');
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
    const pseg = $('mPeople');
    const refreshPeople = () => pseg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.p === cfg.people));
    pseg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      cfg.people = b.dataset.p; refreshPeople(); try { localStorage.setItem('auld.people', cfg.people); } catch {}
      if (!this.started) { this.onReroll?.({ seed: this.game.seed, houses: cfg.houses }); this.refreshMenu(); } else this.toast(`${b.textContent} from the next New Valley.`, 'info');
    });
    refreshPeople();
    if ($('buildTag')) $('buildTag').textContent = 'build ' + (window.__BUILD || '?') + ' · graphics ' + ['Low', 'Medium', 'High'][gfx.q];
    const gseg = $('mGfx');
    const showGfx = () => gseg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.q === gfx.q));
    showGfx();
    gseg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; setQuality(+b.dataset.q); showGfx(); if ($('buildTag')) $('buildTag').textContent = 'build ' + (window.__BUILD || '?') + ' · graphics ' + ['Low', 'Medium', 'High'][gfx.q]; this.toast(['Low', 'Medium', 'High'][gfx.q] + ' graphics.', 'info'); });
    const sseg = $('mSize');
    const curSize = Object.keys(MAP_SIZES).find((k) => MAP_SIZES[k] === this.game.W) || 'standard';
    sseg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.s === curSize));
    sseg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || b.dataset.s === curSize) return;
      if (this.started && !confirm('Changing the board size restarts the game (save first with F5 if you want to keep it). Continue?')) return;
      try { localStorage.setItem('auld-world.mapsize', b.dataset.s); } catch (err) { this.toast('Could not remember the size here.', 'warn'); return; }
      location.reload();
    });
    $('mBegin').onclick = () => this.closeMenu();
    $('mBack').onclick = () => this.showMain();
    $('hContinue').onclick = () => this.closeMenu();
    // sound: browsers only start audio after a click or key, so unlock on the first one
    const wake = () => { unlock(); window.removeEventListener('pointerdown', wake, true); window.removeEventListener('keydown', wake, true); };
    window.addEventListener('pointerdown', wake, true); window.addEventListener('keydown', wake, true);
    document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('button')) play('click'); });
    const sliders = { sMaster: 'master', sMusic: 'music', sSfx: 'sfx' };
    for (const [id, k] of Object.entries(sliders)) { const el = $(id); if (!el) continue; el.value = Math.round(settings[k] * 100); el.oninput = () => { unlock(); setVolume(k, el.value / 100); if (k === 'sfx') play('coin'); }; }
    const syncMute = () => { $('btnSound').textContent = settings.muted ? 'Sound off' : 'Sound on'; if ($('sMute')) $('sMute').checked = settings.muted; };
    $('btnSound').onclick = () => { unlock(); setMuted(!settings.muted); syncMute(); };
    if ($('sMute')) $('sMute').onchange = () => { setMuted($('sMute').checked); syncMute(); };
    syncMute();
    // objectives: on for new players, off once hidden (remembered)
    try { this.objHidden = localStorage.getItem('auld-world.objectives') === 'off'; } catch { this.objHidden = false; }
    this.objCollapsed = false;
    // damage numbers over a fight: off unless chosen (remembered)
    try { this.dmgNums = localStorage.getItem('auld-world.dmgnums') === 'on'; } catch { this.dmgNums = false; }
    if ($('sDmg')) { $('sDmg').checked = this.dmgNums; $('sDmg').onchange = () => { this.dmgNums = $('sDmg').checked; try { localStorage.setItem('auld-world.dmgnums', this.dmgNums ? 'on' : 'off'); } catch { /* private window */ } }; }
    if ($('sObj')) { $('sObj').checked = !this.objHidden; $('sObj').onchange = () => { this.objHidden = !$('sObj').checked; this.objKey = ''; try { localStorage.setItem('auld-world.objectives', this.objHidden ? 'off' : 'on'); } catch { /* private window */ } }; }
    $('objectives').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      if (b.dataset.act === 'objcollapse') { this.objCollapsed = !this.objCollapsed; this.objKey = ''; this.objT = 0; }
      if (b.dataset.act === 'objhide') { this.objHidden = true; if ($('sObj')) $('sObj').checked = false; try { localStorage.setItem('auld-world.objectives', 'off'); } catch { /* ignore */ } this.toast('Objectives hidden. Turn them back on under Options.', 'info'); $('objectives').classList.add('hidden'); }
    });
    // Options > Keys (T03): every command's key, rebound by clicking it and pressing the new key; kept in the browser
    if ($('kShow')) $('kShow').onclick = () => { const g = $('keyGrid'); g.classList.toggle('hidden'); $('kShow').textContent = g.classList.contains('hidden') ? 'Change keys' : 'Hide keys'; this.rebinding = null; this.renderKeys(); };
    if ($('kGrid')) { $('kGrid').checked = this.gridKeys; $('kGrid').onchange = () => this.setGridKeys($('kGrid').checked); }
    if ($('kReset')) $('kReset').onclick = () => { this.kmap = defaultKeys(); this.rebinding = null; saveKeys(this.keyStore, this.kmap); this.applyKeys(); this.toast('Keys back to their defaults.', 'info'); };
    if ($('keyGrid')) $('keyGrid').addEventListener('click', (e) => { const b = e.target.closest('button[data-key]'); if (!b) return; this.rebinding = this.rebinding === b.dataset.key ? null : b.dataset.key; this.renderKeys(); });
    this.applyKeys();
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
    $('mFog').checked = !!g._fog;   // the real setting (the title view lifts fog for display only)
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
  // ------------------------------------------------------------ guided objectives
  renderObjectives() {
    const el = $('objectives'); if (!el) return;
    const show = this.started && !this.menuOpen && !this.game.outcome && this.cfg.objectives !== false && !this.objHidden;
    if (!show) { el.classList.add('hidden'); return; }
    this.objT = (this.objT || 0) - 1; if (this.objT > 0) return; this.objT = 20;   // re-evaluate a few times a second
    const p = progress(this.game), key = p.index + ':' + this.objCollapsed;
    if (key === this.objKey) { el.classList.remove('hidden'); return; }
    this.objKey = key;
    if (this.objPrev != null && p.index > this.objPrev) { this.toast(`Done: ${p.steps[this.objPrev]?.title}. Next: ${p.step.title}.`, 'good'); play('ready'); }
    this.objPrev = p.index;
    el.classList.remove('hidden');
    el.innerHTML = `<div class="ohead"><b>Objective ${p.index + 1}/${p.total}</b><span><button data-act="objcollapse" title="Fold">${this.objCollapsed ? '+' : '-'}</button><button data-act="objhide" title="Hide objectives (turn back on in Options)">x</button></span></div>`
      + `<div class="otitle">${esc(p.step.title)}</div>` + (this.objCollapsed ? '' : `<div class="ohint">${esc(fillKeys(p.step.hint, this.kmap))}</div><div class="osteps">${p.steps.map((s) => `<i class="${s.done ? 'on' : ''}" title="${esc(s.title)}"></i>`).join('')}</div>`);
  }

  // ------------------------------------------------------------ save / load
  saveGame(slot = 'manual', quiet = false) {
    const g = this.game;
    if (!this.started || g.outcome) { if (!quiet) this.toast('There is no game in progress to save.', 'warn'); return false; }
    const ok = writeSave(slot, { ...g.serialize(), groups: this.groups });   // (the control groups ride along with the match)
    if (!quiet) this.toast(ok ? 'Game saved.' : 'Could not save: the browser refused storage (private window or full).', ok ? 'good' : 'warn');
    this.refreshSaveBar();
    return ok;
  }
  loadGame(slot = 'manual') {
    const d = readSave(slot);
    if (!d) { this.toast('No saved game there yet.', 'warn'); return false; }
    try { this.onLoad(d); } catch (e) { console.error('[auld-world] load failed', e); this.toast('That save could not be loaded: ' + e.message, 'warn'); return false; }
    this.groups = cleanGroups(d.groups); this.sigGroups = '';
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
    // a short chronicle: what happened and, after a fall, one thing to try next time (a bare "you lost" gave no reason to try again: playtest 2026-10-14)
    const g = this.game, p = g.players[PLAYER], by = p.lineEndedBy, standing = g.players.filter((q) => q.team !== PLAYER && q.alive).length;
    const lines = [
      by != null && by >= 0 && by !== PLAYER ? `Your line was ended by ${esc(g.players[by].name)}.` : '',
      `Kings lost: ${p.kingsLost || 0} · villages held: ${g.villagesOf(PLAYER).length} · coin earned: ${Math.round(p.earnedTotal || 0)} · rival houses standing: ${standing} of ${g.players.length - 1}`,
      o.result === 'victory' ? '' : '<i>Next time: rival houses demand tribute from about minute 7 and march on the weak. Train soldiers early, and when raiders come, put your king inside a keep or your village.</i>',
    ].filter(Boolean);
    let ch = $('endChron'); if (!ch) { ch = document.createElement('p'); ch.id = 'endChron'; ch.className = 'chron'; $('endText').after(ch); }
    ch.innerHTML = lines.join('<br>');
    $('end').classList.remove('hidden');
  }
}
