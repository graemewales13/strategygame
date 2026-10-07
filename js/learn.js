// Auld World - learning from the player. Pure functions (no DOM, no storage): they turn recorded matches into a "playbook" the rival AI blends
// into its own habits. A record (see recorder.js) is { v:1, id, dur, result, builds:[[t,kind]], trains:[[t,kind]], attacks:[[t,n]], wars:[t], samples:[{t,serf,army,camel,mine,gw,gf,gg,rt}] }.
// The more (and the more successful) matches there are, the higher the playbook's confidence and the harder it pulls the AI toward the player's way.

import { BUILDINGS } from './config.js';

export const CURVE_STEP = 30;          // seconds between points on the learned curves
export const CONF_CAP = 0.85;          // the AI never gives up its own judgement entirely
export const TRAINED_AT = 0.8;         // confidence at which we call the AI "trained" (about five matches' worth)
const MIN_DUR = 150, MIN_BUILDS = 4, WEIGHT = { victory: 1, defeat: 0.45, quit: 0.3, live: 0.3 };

export const weightOf = (r) => WEIGHT[r.result] ?? 0.3;
export const usable = (r) => !!r && r.v === 1 && r.dur >= MIN_DUR && (r.builds?.length || 0) >= MIN_BUILDS;
export const lerp = (a, b, w) => a + (b - a) * w;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sum = (a) => a.reduce((x, y) => x + y, 0);

// value of a record's sampled series at time t (linear between samples; null outside what was recorded)
function sampleAt(r, key, t) {
  const s = r.samples || [];
  if (!s.length || t > r.dur + CURVE_STEP) return null;
  if (t <= s[0].t) return s[0][key] ?? 0;
  for (let i = 1; i < s.length; i++) if (s[i].t >= t) { const a = s[i - 1], b = s[i], f = (t - a.t) / Math.max(1e-6, b.t - a.t); return lerp(a[key] ?? 0, b[key] ?? 0, f); }
  return s[s.length - 1][key] ?? 0;
}

function curve(rs, W, key) {
  const out = [], horizon = Math.max(...rs.map((r) => r.dur));
  for (let t = 0; t <= horizon; t += CURVE_STEP) {
    let sw = 0, sv = 0;
    rs.forEach((r, i) => { const v = sampleAt(r, key, t); if (v != null) { sw += W[i]; sv += W[i] * v; } });
    if (sw > 0) out.push(sv / sw);
  }
  return out;
}

export function learnPlaybook(records) {
  const rs = (records || []).filter(usable);
  if (!rs.length) return null;
  const W = rs.map(weightOf), tot = sum(W);
  // build order: mean position of each "nth building of a kind" across matches; kept if most weight built it
  const rank = new Map();
  rs.forEach((r, i) => {
    const seen = {};
    r.builds.filter((b) => BUILDINGS[b[1]]).forEach(([t, k], j) => {
      seen[k] = (seen[k] || 0) + 1;
      if (seen[k] > 8) return;
      const key = k + '#' + seen[k], e = rank.get(key) || { k, n: seen[k], w: 0, idx: 0, t: 0 };
      e.w += W[i]; e.idx += W[i] * j; e.t += W[i] * t; rank.set(key, e);
    });
  });
  const plan = [...rank.values()].filter((e) => e.w >= tot * 0.5).map((e) => ({ k: e.k, n: e.n, idx: e.idx / e.w, t: Math.round(e.t / e.w) })).sort((a, b) => a.idx - b.idx);
  // what they trained
  const mixRaw = {}; let mixN = 0;
  rs.forEach((r, i) => { for (const [, k] of r.trains || []) if (['footman', 'bowman', 'knight', 'ram'].includes(k)) { mixRaw[k] = (mixRaw[k] || 0) + W[i]; mixN += W[i]; } });
  const mix = mixN >= 4 ? Object.fromEntries(Object.entries(mixRaw).map(([k, v]) => [k, +(v / mixN).toFixed(3)])) : null;
  // when and how big they attacked
  let aw = 0, af = 0, as = 0, an = 0;
  rs.forEach((r, i) => { const a = (r.attacks || []).filter(([, n]) => n >= 2); if (a.length) { aw += W[i]; af += W[i] * a[0][0]; for (const [, n] of a) { as += W[i] * n; an += W[i]; } } });
  const attack = aw >= tot * 0.34 ? { first: Math.round(af / aw), size: +(as / an).toFixed(1) } : null;
  let ww = 0, wt = 0;
  rs.forEach((r, i) => { if (r.wars?.length) { ww += W[i]; wt += W[i] * r.wars[0]; } });
  const warAt = ww >= tot * 0.34 ? Math.round(wt / ww) : null;
  // where their serfs worked
  let gw = 0, gf = 0, gg = 0;
  for (const r of rs) for (const s of r.samples || []) { gw += s.gw || 0; gf += s.gf || 0; gg += s.gg || 0; }
  const gt = gw + gf + gg, share = gt >= 40 ? { wood: +(gw / gt).toFixed(3), food: +(gf / gt).toFixed(3), gold: +(gg / gt).toFixed(3) } : null;
  // camels
  let cw = 0, cm = 0, ru = 0, rw = 0;
  rs.forEach((r, i) => {
    const s = r.samples || [], mines = Math.max(0, ...s.map((x) => x.mine || 0)), camels = Math.max(0, ...s.map((x) => x.camel || 0));
    if (mines >= 1) { cw += W[i]; cm += W[i] * Math.min(1.5, camels / mines); }
    const withC = s.filter((x) => x.camel > 0); if (withC.length >= 3) { rw += W[i]; ru += W[i] * (withC.filter((x) => x.rt > 0).length / withC.length); }
  });
  const camels = cw ? { perMine: +(cm / cw).toFixed(2), routeUse: rw ? +(ru / rw).toFixed(2) : 0 } : null;
  const conf = Math.min(CONF_CAP, 1 - Math.exp(-tot / 3));
  return {
    v: 1, matches: rs.length, wins: rs.filter((r) => r.result === 'victory').length, eff: +tot.toFixed(2), conf: +conf.toFixed(3),
    trained: conf >= TRAINED_AT, plan, serf: curve(rs, W, 'serf'), army: curve(rs, W, 'army'), step: CURVE_STEP, mix, attack, warAt, share, camels,
  };
}

export const curveAt = (c, step, t) => {
  if (!c || !c.length) return null;
  const x = Math.max(0, t) / step, i = Math.floor(x);
  return i >= c.length - 1 ? c[c.length - 1] : lerp(c[i], c[i + 1], x - i);
};

// the AI's fixed build list, re-ordered toward the player's order (and extended with what they built that the list lacks)
const planCache = new WeakMap();
export function blendPlan(def, pb) {
  if (!pb || !pb.plan?.length || pb.conf <= 0) return def;
  const hit = planCache.get(pb); if (hit && hit.def === def) return hit.out;
  const w = pb.conf, items = new Map();
  def.forEach(([k, n], i) => items.set(k + '#' + n, { k, n, d: i, l: 40 }));
  for (const e of pb.plan) { if (!BUILDINGS[e.k]) continue; const key = e.k + '#' + e.n, it = items.get(key); if (it) it.l = e.idx; else if (e.n <= 8) items.set(key, { k: e.k, n: e.n, d: 40, l: e.idx }); }
  const out = [...items.values()].map((e) => ({ ...e, s: lerp(e.d, e.l, w) })).sort((a, b) => a.s - b.s).map((e) => [e.k, e.n]);
  planCache.set(pb, { def, out });
  return out;
}

// how well do these rivals' own records agree with a playbook? (used by tools/arena.js and the menu: 0..1, 1 = identical pace)
export function paceFit(pb, rec) {
  if (!pb || !rec?.samples?.length) return 0;
  let err = 0, n = 0;
  for (let t = 60; t <= Math.min(rec.dur, 900); t += CURVE_STEP) {
    const a = curveAt(pb.army, pb.step, t), s = sampleAt(rec, 'army', t);
    if (a != null && s != null) { err += Math.abs(a - s) / Math.max(4, a, s); n++; }
  }
  return n ? +(1 - err / n).toFixed(3) : 0;
}
