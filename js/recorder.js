// Auld World - the recorder. Watches the player's orders and, every few seconds, the state of their house; keeps the matches in
// localStorage (capped) so learn.js can turn them into a playbook for the rival AI. Never throws into the game; storage is injectable for tests.
import { PLAYER, NODE_RES } from './config.js';

const KEY = 'auld.rec.v1', ON_KEY = 'auld.rec.on', MAX_RECORDS = 30, MAX_BYTES = 1_500_000, SAMPLE_EVERY = 20, SAVE_EVERY = 60, MAX_EV = 1500;

export class Recorder {
  constructor(storage = null) {
    this.store = storage; this.cur = null; this.game = null; this.lastSample = 0; this.lastSave = 0; this.on = this._get(ON_KEY) !== '0';
    this.onChange = null;
  }
  _get(k) { try { return this.store?.getItem(k) ?? null; } catch { return null; } }
  _set(k, v) { try { this.store?.setItem(k, v); return true; } catch { return false; } }
  setEnabled(on) { this.on = !!on; this._set(ON_KEY, on ? '1' : '0'); if (!on) this.finish('quit'); }

  records() { try { const a = JSON.parse(this._get(KEY) || '[]'); return Array.isArray(a) ? a.filter((r) => r && r.v === 1) : []; } catch { return []; } }
  _write(list) {
    list = list.slice(-MAX_RECORDS);
    let s = JSON.stringify(list);
    while (s.length > MAX_BYTES && list.length > 1) { list.shift(); s = JSON.stringify(list); }
    return this._set(KEY, s);
  }

  // begin recording a fresh match (call after the game is created or re-rolled). `record:false` for loaded saves, which lack their early history.
  start(game, { record = true } = {}) {
    this.finish('quit');
    this.game = game; game.tap = null; this.cur = null;
    if (!record || !this.on || !game) return;
    const at = Date.now();
    this.cur = { v: 1, id: at.toString(36) + '-' + game.seed, at, seed: game.seed, houses: game.houses, diff: game.diffKey, dur: 0, result: 'live', builds: [], trains: [], attacks: [], wars: [], samples: [] };
    this.lastSample = game.time; this.lastSave = game.time;
    game.tap = (it, r) => this.intent(it, r);
  }

  intent(it, r) {
    const c = this.cur, g = this.game;
    if (!c || !r || c.builds.length + c.trains.length + c.attacks.length > MAX_EV) return;
    const t = Math.round(g.time);
    switch (it.type) {
      case 'place': c.builds.push([t, it.kind]); break;
      case 'train': case 'drill': if (it.kind) c.trains.push([t, it.kind]); break;
      case 'relation': if (it.state === 'war') c.wars.push(t); break;
      case 'attack': case 'pillage': case 'context': {   // a right-click on a foe is an attack: count who actually set off
        const n = (it.ids || []).filter((id) => g.byId.get(id)?.task?.type === 'attack').length;
        if (n) c.attacks.push([t, n]);
        break;
      }
    }
  }

  sample() {
    const g = this.game, c = this.cur; if (!g || !c) return;
    const mine = g.units.filter((u) => u.team === PLAYER && u.hp > 0);
    const s = { t: Math.round(g.time), serf: 0, army: g.militaryOf(PLAYER).length, camel: 0, mine: g.buildings.filter((b) => b.team === PLAYER && b.kind === 'mine' && b.built >= 1 && b.hp > 0).length, gw: 0, gf: 0, gg: 0, rt: 0 };
    for (const u of mine) {
      if (u.kind === 'serf') {
        s.serf++;
        if (u.task.type === 'gather' || u.task.type === 'return') {
          const node = u.task.nodeId != null ? g.resources[u.task.nodeId] : null, r = node ? NODE_RES[node.kind] : u.carry?.kind;
          if (r === 'wood') s.gw++; else if (r === 'food') s.gf++; else if (r === 'gold') s.gg++;
        }
      } else if (u.kind === 'camel') { s.camel++; if (u.route) s.rt++; }
    }
    c.samples.push(s); c.dur = s.t;
  }

  // call every frame: cheap unless a sample or save is due
  tick() {
    const g = this.game, c = this.cur; if (!g || !c) return;
    if (g.time - this.lastSample >= SAMPLE_EVERY) { this.lastSample = g.time; this.sample(); }
    if (g.outcome) { this.finish(g.outcome.result === 'victory' ? 'victory' : 'defeat'); return; }
    if (g.time - this.lastSave >= SAVE_EVERY) { this.lastSave = g.time; this.save(); }
  }

  save() {
    const c = this.cur; if (!c) return;
    c.dur = Math.max(c.dur, Math.round(this.game.time));
    const list = this.records().filter((r) => r.id !== c.id); list.push(c); this._write(list);
    this.onChange?.();
  }

  finish(result) {
    const c = this.cur; if (!c) return;
    this.cur = null; if (this.game) this.game.tap = null;
    const last = c.samples[c.samples.length - 1]; if (this.game && this.game.time > (last ? last.t : 0)) this.sample0(c);
    c.result = result; c.dur = Math.max(c.dur, Math.round(this.game?.time || 0));
    if (c.dur >= 60) { const list = this.records().filter((r) => r.id !== c.id); list.push(c); this._write(list); }
    this.onChange?.();
  }
  sample0(c) { const keep = this.cur; this.cur = c; try { this.sample(); } finally { this.cur = keep; } }   // a last reading at the end

  exportJSON() { return JSON.stringify({ app: 'auld-world', kind: 'recordings', records: this.records() }); }
  importJSON(text) {
    let data; try { data = JSON.parse(text); } catch { return { ok: false, added: 0, error: 'not valid JSON' }; }
    const incoming = Array.isArray(data) ? data : Array.isArray(data?.records) ? data.records : data?.v === 1 ? [data] : null;
    if (!incoming) return { ok: false, added: 0, error: 'no recordings in that file' };
    const have = this.records(), ids = new Set(have.map((r) => r.id));
    let added = 0;
    for (const r of incoming) if (r && r.v === 1 && typeof r.id === 'string' && Array.isArray(r.builds) && !ids.has(r.id)) { have.push(r); ids.add(r.id); added++; }
    have.sort((a, b) => (a.at || 0) - (b.at || 0));
    this._write(have); this.onChange?.();
    return { ok: true, added };
  }
  clear() { this._set(KEY, '[]'); this.onChange?.(); }
}
