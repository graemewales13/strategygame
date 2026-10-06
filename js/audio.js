// Auld World - sound. Everything is synthesised with the Web Audio API (no sound files to ship or to fail to load):
// short effects for fighting, building, trading and alarms, plus a slow generative score. Settings persist in localStorage.
const KEY = 'auld-world.settings';
const DEFAULTS = { master: 0.7, music: 0.5, sfx: 0.8, muted: false };
export const settings = (() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; } })();
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private window */ } };

let ctx = null, master, sfxBus, musicBus, noiseBuf, musicTimer = 0, lastPlay = {};
const THROTTLE = { hit: 0.07, arrow: 0.08, death: 0.15, crumble: 0.3, coin: 0.12, built: 0.4, ready: 0.5, alarm: 4, fanfare: 2, click: 0.03 };

function ensure() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  try { ctx = new AC(); } catch { return null; }
  master = ctx.createGain(); sfxBus = ctx.createGain(); musicBus = ctx.createGain();
  const comp = ctx.createDynamicsCompressor(); sfxBus.connect(comp); musicBus.connect(comp); comp.connect(master); master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applyVolumes(); startMusic();
  return ctx;
}
function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(settings.muted ? 0 : settings.master, t, 0.05);
  sfxBus.gain.setTargetAtTime(settings.sfx, t, 0.05); musicBus.gain.setTargetAtTime(settings.music * 0.55, t, 0.05);
}
export function setVolume(kind, v) { settings[kind] = Math.max(0, Math.min(1, v)); persist(); applyVolumes(); }
export function setMuted(m) { settings.muted = !!m; persist(); applyVolumes(); if (!m) ensure(); }
export function unlock() { ensure(); }   // call from any click or key: browsers only allow sound after a gesture

// ---- building blocks
const env = (g, t, a, d, peak) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
function tone(freq, dur, { type = 'sine', peak = 0.3, attack = 0.005, slide = 0, delay = 0, bus = sfxBus } = {}) {
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  env(g, t, attack, dur, peak); o.connect(g); g.connect(bus); o.start(t); o.stop(t + attack + dur + 0.05);
}
function noise(dur, { f0 = 1200, f1 = 400, q = 1, peak = 0.3, type = 'bandpass', delay = 0 } = {}) {
  const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  env(g, t, 0.004, dur, peak); s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + dur + 0.05);
}
const SFX = {
  hit: () => { noise(0.09, { f0: 1800, f1: 500, q: 2, peak: 0.35 }); tone(140 + Math.random() * 40, 0.1, { type: 'triangle', peak: 0.25, slide: -60 }); },
  arrow: () => noise(0.12, { f0: 3500, f1: 1200, q: 3, peak: 0.12 }),
  death: () => tone(180, 0.35, { type: 'sawtooth', peak: 0.12, slide: -110 }),
  crumble: () => { noise(0.7, { f0: 500, f1: 80, q: 0.7, peak: 0.55, type: 'lowpass' }); tone(70, 0.6, { type: 'sine', peak: 0.4, slide: -35 }); },
  coin: () => { tone(1320, 0.12, { type: 'triangle', peak: 0.16 }); tone(1760, 0.2, { type: 'triangle', peak: 0.14, delay: 0.07 }); },
  built: () => { tone(392, 0.2, { type: 'triangle', peak: 0.2 }); tone(523, 0.3, { type: 'triangle', peak: 0.2, delay: 0.12 }); },
  ready: () => { tone(660, 0.14, { type: 'sine', peak: 0.2 }); tone(880, 0.22, { type: 'sine', peak: 0.2, delay: 0.1 }); },
  alarm: () => { for (let i = 0; i < 3; i++) tone(i % 2 ? 520 : 390, 0.18, { type: 'square', peak: 0.1, delay: i * 0.2 }); },
  fanfare: () => { [392, 494, 587, 784].forEach((f, i) => tone(f, 0.45, { type: 'sawtooth', peak: 0.1, delay: i * 0.13 })); },
  click: () => tone(900, 0.04, { type: 'square', peak: 0.05 }),
};
export function play(name, vol = 1) {
  if (settings.muted || !ctx || !SFX[name]) return;
  const now = ctx.currentTime, th = THROTTLE[name] || 0.05;
  if (now - (lastPlay[name] || -9) < th) return; lastPlay[name] = now;
  if (vol < 1) { const prev = sfxBus.gain.value; sfxBus.gain.setTargetAtTime(settings.sfx * vol, now, 0.005); SFX[name](); setTimeout(() => ctx && sfxBus.gain.setTargetAtTime(settings.sfx, ctx.currentTime, 0.05), 160); }
  else SFX[name]();
}

// ---- the score: a drone on D with soft plucked notes from a minor pentatonic, drifting between two chords
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17];
function startMusic() {
  const root = 146.83; // D3
  const drone = (f, peak) => { const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 340; g.gain.value = peak; o.connect(lp); lp.connect(g); g.connect(musicBus); o.start(); return o; };
  drone(root / 2, 0.16); drone(root * 0.75, 0.1); const d3 = drone(root * 1.0, 0.08);
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 1.2; lfo.connect(lg); lg.connect(d3.detune); lfo.start();
  const pluck = () => {
    if (!ctx) return;
    if (!settings.muted && settings.music > 0) {
      const semis = PENTA[Math.floor(Math.random() * PENTA.length)], f = root * 2 * Math.pow(2, semis / 12);
      tone(f, 1.8, { type: 'triangle', peak: 0.2, attack: 0.01, bus: musicBus }); if (Math.random() < 0.4) tone(f * 1.5, 1.4, { type: 'sine', peak: 0.08, delay: 0.25, bus: musicBus });
    }
    musicTimer = setTimeout(pluck, 2500 + Math.random() * 5000);
  };
  pluck();
}

// Spatial effects: the UI passes the camera centre; quieter and silent with distance.
export function playAt(name, x, y, cam) {
  if (!ctx) return;
  const d = Math.hypot(x - cam.x, y - cam.y) / Math.max(0.6, cam.zoom), vol = d < 14 ? 1 : d > 55 ? 0 : 1 - (d - 14) / 41;
  if (vol > 0.05) play(name, Math.max(0.15, vol));
}
