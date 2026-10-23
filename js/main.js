// Auld World - entry point. Single-player: the host (Game) lives in this tab; the client talks to it through net.js.
import { DEFAULT_HOUSES, PLAYER, setLocalPlayer, MAP_SIZES, MAP_W, MIN_HOUSES, MAX_HOUSES, PEOPLE_KEYS } from './config.js';
import { Game } from './game.js';
import { LocalHost, LockstepClient, NET } from './net.js';
import { matchGame } from './online.js';
import { initOnline } from './onlineui.js';
import { Renderer, Minimap, drawCrest } from './render.js';
import { UI } from './ui.js';
import { loadArt } from './art.js';
import { Recorder } from './recorder.js';
import { learnPlaybook } from './learn.js';
import { initTrainPanel } from './trainui.js';

const cfg = { houses: MAX_HOUSES, fog: true, diff: 'mid', people: 'random' };   // (every people at the table by default; the menu offers 3 to 8. The engine and tests keep DEFAULT_HOUSES)
try { const p = localStorage.getItem('auld.people'); if (p) cfg.people = p; } catch {}
const params = new URLSearchParams(location.search);
if (params.get('houses')) cfg.houses = Math.max(MIN_HOUSES, Math.min(MAX_HOUSES, +params.get('houses')));
if (PEOPLE_KEYS.includes(params.get('people'))) cfg.people = params.get('people');
if (params.get('fog') === '0') cfg.fog = false;
if (['easy', 'mid', 'hard'].includes(params.get('diff'))) cfg.diff = params.get('diff');

const pendingClick = () => window.__boot && window.__boot.pending;
await Promise.race([loadArt(), new Promise((r) => setTimeout(r, 10000))]);   // a slow image must not hold the game hostage
const game = new Game({ seed: params.get('seed') ? +params.get('seed') : undefined, houses: cfg.houses, fog: cfg.fog, diff: cfg.diff, people: cfg.people });
// Online (groundwork): ?mp=<room>&name=<you> joins a room on the relay that served this page (node relay.js), or on ?relay=ws://...
const mpRoom = params.get('mp');
let net = null, mpStarted = false, hourly = null;   // hourly: { match, ticket, ws } while in an hourly match (js/onlineui.js)
const local = new LocalHost(game);
const host = { send: (intent) => (mpRoom || mpStarted ? net?.send(intent) ?? false : local.send(intent)) };   // online, orders go to the server and come back on their turn
const renderer = new Renderer(document.getElementById('game'), game);
// the rivals learn from the player: every match is recorded, and the playbook is re-learned between matches (never mid-match)
let store = null; try { store = localStorage; } catch {}
const recorder = new Recorder(store);
let shipped = [];
try { const r = await Promise.race([fetch('data/features.json'), new Promise((_, no) => setTimeout(no, 3000))]); if (r.ok) shipped = (await r.json()).records || []; } catch {}
let trainPanel = { refresh() {} };
const retrain = () => { try { game.playbook = learnPlaybook([...shipped, ...recorder.records().filter((r) => r.result !== 'live')]); } catch (e) { console.error('[auld-world] learning failed', e); game.playbook = null; } };
recorder.onChange = () => { if (!recorder.cur) retrain(); trainPanel.refresh(); };
retrain(); if (!mpRoom) recorder.start(game);   // (an online match is not recorded for the rivals to learn from)
window.addEventListener('pagehide', () => recorder.finish('quit'));
const minimap = new Minimap(document.getElementById('minimap'), game, renderer);
const ui = new UI({ game, host, renderer, minimap, cfg });
trainPanel = initTrainPanel({ recorder, getPlaybook: () => game.playbook, getSeedCount: () => shipped.length });

ui.onReroll = (opts) => {
  if (mpStarted) { ui.toast('This is an online match: a new valley or a saved game would leave the others behind. Reload without ?mp to play alone.', 'warn'); return; }
  recorder.finish('quit');
  game.reset({ seed: opts.seed, houses: opts.houses, fog: cfg.fog, diff: cfg.diff, people: cfg.people });
  ui.setGame(game);
  recorder.start(game);
  ui.firstFocus = false;
  centerOnHall();
};
ui.onLoad = (data) => {
  if (mpStarted) { ui.toast('This is an online match: a new valley or a saved game would leave the others behind. Reload without ?mp to play alone.', 'warn'); return; }
  recorder.finish('quit');
  game.restore(data);
  ui.setGame(game);
  recorder.start(game, { record: false });
  renderer.resetWorld?.();
  centerOnHall();
};
function centerOnHall() {
  const s = game.seatOf(PLAYER) || game.kingOf(PLAYER) || game.thronePlace(PLAYER);
  renderer.cam.zoom = 1;
  if (s) renderer.centerOn(s.x, s.y);
}
centerOnHall();
ui.refreshMenu();
drawCrest(document.getElementById('brandCrest').getContext('2d'), 18, 20, 34, 0);
const wasPending = pendingClick();
window.__boot = { ready: true, pending: false };
const online = await initOnline({ ui, getGame: () => game, getNet: () => net, onPlay: (t) => playHourly(t) });   // (the plaque and online menu: only when the api served this page)
if (mpRoom) joinOnline();
else if (params.get('start') === '1') ui.closeMenu();
else if (wasPending) document.getElementById('splash').click();   // they clicked while it loaded: open the menu now

const seenErr = new Set();
function reportError(where, e) {
  const key = where + ':' + (e && e.message);
  if (seenErr.has(key)) return;
  seenErr.add(key);
  console.error('[auld-world]', where, e, e && e.stack);
  let box = document.getElementById('errbox');
  if (!box) { box = document.createElement('div'); box.id = 'errbox'; document.body.appendChild(box); }
  lastReport = [`Auld World problem report`, `where: ${where}`, `message: ${e && e.message}`, `build: ${window.__BUILD || '?'}`, `seed: ${game.seed} houses: ${game.houses} time: ${Math.round(game.time)}s`, `browser: ${navigator.userAgent}`, `screen: ${innerWidth}x${innerHeight} @${devicePixelRatio}`, `stack: ${e && e.stack}`].join('\n');
  box.textContent = '';
  const msg = document.createElement('span'); msg.textContent = `Problem (${where}): ${e && e.message}. The game keeps running. `; box.appendChild(msg);
  const btn = document.createElement('button'); btn.textContent = 'Copy report';
  btn.onclick = async () => { try { await navigator.clipboard.writeText(lastReport); btn.textContent = 'Copied - send it to the developer'; } catch { prompt('Copy this report:', lastReport); } };
  box.appendChild(btn);
}
let lastReport = '';
window.addEventListener('error', (ev) => reportError('script', ev.error || new Error(ev.message)));
window.addEventListener('unhandledrejection', (ev) => reportError('promise', ev.reason instanceof Error ? ev.reason : new Error(String(ev.reason))));

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (mpStarted) {   // online: the turns from the relay drive the match (no pause, no speed-up: everyone shares one clock)
    try { net.step(NET.maxPerFrame); } catch (e) { reportError('simulation', e); }
    mpStatus();
  } else if (!ui.menuOpen && !ui.paused) {
    let sim = dt * ui.speed;
    try { while (sim > 1e-6) { const s = Math.min(0.05, sim); game.tick(s); sim -= s; } } catch (e) { reportError('simulation', e); }
    try { recorder.tick(); } catch (e) { console.error('[auld-world] recorder', e); recorder.cur = null; game.tap = null; }
  }
  // one bad frame must not freeze the whole game: report it and keep going
  try { ui.update(dt); } catch (e) { reportError('update', e); }
  try { renderer.draw(ui); } catch (e) { reportError('draw', e); }
  try { minimap.draw(dt); } catch (e) { reportError('minimap', e); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__seven = { game, host, renderer, ui, recorder, get net() { return net; } }; // debugging hook

// ---- online lobby (groundwork): a small panel over the menu; the room's host picks houses and difficulty and starts ----------------
function lobbyEl() {
  let el = document.getElementById('mpLobby');
  if (!el) {
    el = document.createElement('div'); el.id = 'mpLobby'; el.className = 'offer';
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-mp]'); if (b) onLobbyClick(b.dataset); });
    document.body.appendChild(el);
  }
  return el;
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }   // (a declaration: the lobby is drawn before this line is reached)
function drawLobby(note = '') {
  const el = lobbyEl(), c = net?.config || {}, me = net?.members?.find((m) => m.you);
  const seats = (net?.members || []).map((m) => `<div>${m.seat >= 0 ? `Seat ${m.seat + 1}` : 'Watching'} · <b>${esc(m.name)}</b>${m.host ? ' (host)' : ''}${m.connected ? '' : ' · <i>away</i>'}${m.you ? ' · you' : ''}</div>`).join('');
  const hostCtl = net?.isHost && !net.started ? `<div class="row">Houses ${[3, 4, 5].map((n) => `<button data-mp="houses" data-v="${n}" ${c.houses === n ? 'style="border-color:#e8c35a"' : ''}>${n}</button>`).join('')}</div>
    <div class="row">Difficulty ${['easy', 'mid', 'hard'].map((d) => `<button data-mp="diff" data-v="${d}" ${c.diff === d ? 'style="border-color:#e8c35a"' : ''}>${d}</button>`).join('')}</div>
    <div class="row"><button data-mp="start">Start the match</button></div>` : net?.started ? '' : '<div class="row">Waiting for the host to start. Empty seats are played by the AI.</div>';
  el.innerHTML = `<b>Online room “${esc(mpRoom)}”</b> <small>(experimental)</small><div style="margin:6px 0">${seats || 'Connecting…'}</div>${hostCtl}${note ? `<div class="row" style="color:#e0866a">${esc(note)}</div>` : ''}`;
  el.style.cssText = 'position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:60;min-width:280px;' + (net?.started || hourly ? 'display:none' : '');
  void me;
}
function onLobbyClick(d) {
  if (!net) return;
  if (d.mp === 'houses') net.configure({ houses: +d.v });
  else if (d.mp === 'diff') net.configure({ diff: d.v });
  else if (d.mp === 'start') {
    const size = Object.keys(MAP_SIZES).find((k) => MAP_SIZES[k] === MAP_W) || 'standard';
    net.configure({ size, people: cfg.people, fog: cfg.fog, playbook: game.playbook || null });   // every copy must play the same rivals: the host's
    setTimeout(() => net.start(), 50);
  }
}
async function joinOnline() {
  const relay = params.get('relay') || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const key = 'auld.mp.' + mpRoom; let token = null; try { token = sessionStorage.getItem(key); } catch {}
  net = new LockstepClient({ url: relay, room: mpRoom, name: params.get('name') || 'Player', build: window.__BUILD || '', token });
  net.onLobby = () => drawLobby();
  net.onError = (m) => drawLobby(m.msg);
  net.onDesync = (m) => ui.toast(`Out of step with the other players at turn ${m.n}. Reload the page to rejoin the match.`, 'bad');
  net.onClose = () => { if (mpStarted) ui.toast('Lost the connection to the relay. Reload the page to rejoin.', 'bad'); else drawLobby('Lost the connection to the relay.'); };
  net.onStart = (c) => beginOnline(c);
  drawLobby();
  try { await net.connect(); try { sessionStorage.setItem(key, net.token); } catch {} drawLobby(); }
  catch (e) { drawLobby(`Could not join: ${e.message || e}. Start the relay with "node relay.js" and open the page it serves.`); }
}
// a match begins on this screen (an open room or an hourly match; also after a rejoin, when the server's state follows in attach)
function beginOnline(c, { rejoin = false } = {}) {
  const size = MAP_SIZES[c.size];
  if (size && size !== MAP_W) { try { localStorage.setItem('auld-world.mapsize', c.size); } catch {} location.reload(); return; }   // the board size is read at load
  if (!mpStarted) recorder.finish('quit');   // (an online match is not recorded for the rivals to learn from)
  game.tap = null;
  setLocalPlayer(net.seat >= 0 ? net.seat : (c.humans?.[0] ?? 0));   // watchers see through the first player's eyes
  matchGame(game, c);   // (the same build as every other copy and the server's referee: js/online.js)
  ui.setGame(game); net.attach(game); renderer.resetWorld?.();
  const splash = document.getElementById('splash'); if (splash && !splash.classList.contains('hidden')) { splash.classList.add('gone', 'hidden'); }   // the match is on: no title screens
  const first = !mpStarted;
  mpStarted = true; ui.online = true; ui.speed = 1; ui.paused = false; drawLobby(); ui.closeMenu();
  if (first || !rejoin) centerOnHall();
  online.herald.show(!!hourly);
  if (first) ui.toast(net.seat >= 0 ? `Online: you are ${game.players[PLAYER].name}.` : 'Online: watching the match.', 'good');
}
// an hourly match (ONLINE.md): the ticket the api gave, the match server's WebSocket; a dropped connection is retried with a fresh ticket
let retry = { n: 0, timer: null };
async function playHourly(t, again = false) {
  hourly = t; clearTimeout(retry.timer);
  const old = net;
  if (old) { old.onClose = () => {}; old.close(); }
  net = new LockstepClient({ url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${t.ws}`, ticket: t.ticket, room: t.match, build: window.__BUILD || '' });
  net.onStart = (c) => beginOnline(c, { rejoin: again });
  net.onLobby = (m) => { if (!net.started) drawWaiting(m); };
  net.onSaid = (m) => online.herald.said(m);
  net.onEnd = (r) => { online.herald.show(false); online.showResult(r); };
  net.onResync = () => { ui.setGame(game); renderer.resetWorld?.(); };   // (the server's state replaced this copy's: the screen follows)
  net.onError = (m) => ui.toast(m.msg, 'bad');
  net.onClose = () => reconnect();
  try { await net.connect(); retry.n = 0; if (!net.started) drawWaiting({ members: net.members }); }
  catch (e) { ui.toast(`Could not reach the match: ${e.message || e}`, 'bad'); reconnect(); }
}
function reconnect() {
  if (!hourly || net?.result) return;   // (the match is over: nothing to rejoin)
  const wait = Math.min(30000, 1000 * 2 ** retry.n++);
  ui.toast(`Lost the connection to the match. Trying again in ${Math.round(wait / 1000)} s...`, 'warn');
  retry.timer = setTimeout(async () => {
    try { const r = await fetch('/api/play', { headers: { 'X-Auld': '1' }, credentials: 'same-origin' }); if (r.status === 404) { ui.toast('That match has ended.', 'info'); return; } if (!r.ok) throw new Error(String(r.status)); playHourly(await r.json(), true); }
    catch { reconnect(); }
  }, wait);
}
// before an hourly match starts: who is here, and how long it waits for the rest
function drawWaiting(m) {
  const el = lobbyEl(), here = (m.members || []).filter((x) => x.connected).length, all = (m.members || []).length;
  el.innerHTML = `<b>The match is gathering</b><div style="margin:6px 0">${(m.members || []).map((x) => `<div>${esc(x.name)}${x.you ? ' · you' : ''} · ${x.connected ? 'here' : '<i>not here yet</i>'}</div>`).join('')}</div>`
    + `<div class="row">${here} of ${all} here. It starts when everyone is in${m.startsIn ? `, or in ${m.startsIn} s without the rest (the AI holds their houses until they come)` : ''}.</div>`;
  el.style.cssText = 'position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:60;min-width:300px;';
}
function mpStatus() {
  if ((mpStatus.t = (mpStatus.t || 0) - 1) > 0) return; mpStatus.t = 20;
  let el = document.getElementById('mpStatus');
  if (!el) { el = document.createElement('div'); el.id = 'mpStatus'; el.style.cssText = 'position:fixed;right:8px;bottom:calc(clamp(214px, 31vh, 320px) + 8px);z-index:30;font:12px Georgia,serif;color:#e8d9ae;background:rgba(20,14,8,.75);padding:2px 8px;border:1px solid #6d4d27;border-radius:3px'; document.body.appendChild(el); }
  const lag = net.behind();
  el.innerHTML = `Online · ${esc(mpRoom || (hourly ? `match ${hourly.match}` : ''))} · ${net.seat >= 0 ? `seat ${net.seat + 1}` : 'watching'} · turn ${net.next}${lag > 5 ? ` · catching up ${lag}` : ''}${net.desynced ? ' · <b style="color:#e0866a">out of step</b>' : ''}`;
}
