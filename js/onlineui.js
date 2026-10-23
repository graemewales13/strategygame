// Auld World - the online menu, the Herald (preset messages) and the hourly results (ONLINE.md step 4). DOM only; talks to server/api.js.
// Shown only when the page is served by the api: the plaque on the main menu stays hidden when /api/config cannot be read (a plain file server).
import { HOUSES, PLAYER } from './config.js';
import { QUICK, quickText } from './online.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PROVIDER_LABEL = { google: 'Google', discord: 'Discord', github: 'GitHub' };
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const left = (ms) => { if (ms <= 0) return 'now'; const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h} h ${m} min` : `${m}:${String(x).padStart(2, '0')}`; };
const month = () => new Date().toISOString().slice(0, 7);

async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(path, { method, credentials: 'same-origin', headers: { 'X-Auld': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch {}
  if (!r.ok) throw new Error(j?.error || `The server answered ${r.status}.`);
  return j;
}

/**
 * initOnline({ ui, getGame, getNet, onPlay }) - onPlay(ticket) starts the hourly match the player holds a ticket for (main.js).
 * Returns { available, open(), close(), herald: { said(m), show(on) }, showResult(result) }.
 */
export async function initOnline({ ui, getGame, getNet, onPlay }) {
  let cfg = null;
  try { cfg = await api('/api/config'); } catch { cfg = null; }
  const out = { available: !!cfg, open() {}, close() {}, herald: { said() {}, show() {} }, showResult() {} };
  if (!cfg) return out;   // a plain file server: single player only

  const st = { me: null, sched: null, league: [], season: month(), recent: [], email: '', codeSent: false, err: new URLSearchParams(location.search).get('err') || '', busy: false, autoPlayed: null, timer: null, poll: null };
  const plaque = $('hOnline'); plaque.classList.remove('hidden');
  plaque.onclick = () => out.open();
  $('online').addEventListener('click', onClick);
  $('online').addEventListener('submit', (e) => { e.preventDefault(); onClick({ target: e.target.querySelector('[data-ol="' + e.target.dataset.ol + '"]') || e.target }); });

  async function refresh(all = false) {
    try {
      const [me, sched] = await Promise.all([api('/api/me'), api('/api/schedule')]);
      st.me = me.user; st.sched = sched;
      if (all) { const [lg, rc] = await Promise.all([api(`/api/league?season=${st.season}`), api('/api/recent')]); st.league = lg.rows; st.recent = rc.matches; }
    } catch (e) { st.err = e.message; }
    plaqueText(); draw();
    if (st.sched?.live && st.me && st.autoPlayed !== st.sched.live.id && !getNet()?.started) { st.autoPlayed = st.sched.live.id; play(); }   // your match has begun: in you go
  }
  function plaqueText() {
    const s = st.sched; if (!s) return;
    $('hOnlineNext').textContent = s.live && st.me ? 'Your match is on: rejoin' : `Next match ${clock(s.next.startsAt)} · ${s.next.seats.length}/${s.next.houses} signed up`;
  }
  async function play() {
    try { const t = await api('/api/play'); out.close(); onPlay(t); } catch (e) { st.err = e.message; draw(); }
  }

  out.open = () => {
    $('mainmenu').classList.add('hidden'); $('online').classList.remove('hidden');
    refresh(true);
    clearInterval(st.timer); st.timer = setInterval(() => drawClock(), 1000);
    clearTimeout(st.poll); poll();
  };
  // every 5 s; every second while you are signed up and your match is about to start (or has just started), so you are in at once
  function poll() {
    const s = st.sched; if (s?.next.you) st.mine = s.next.startsAt;   // (the start of the match you signed up for: after it, 'next' is the one after)
    const t = Date.now(), soon = st.mine && t > st.mine - 15000 && t < st.mine + 90000 && !getNet()?.started;
    st.poll = setTimeout(async () => { await refresh(false); if (!$('online').classList.contains('hidden')) poll(); }, soon ? 1000 : 5000);
  }
  out.close = () => { clearInterval(st.timer); clearTimeout(st.poll); $('online').classList.add('hidden'); };
  const back = () => { out.close(); $('mainmenu').classList.remove('hidden'); };

  function drawClock() { const el = $('olCount'); if (el && st.sched) el.textContent = left(st.sched.next.startsAt - Date.now()); }

  function draw() {
    if ($('online').classList.contains('hidden')) return;
    const s = st.sched, me = st.me;
    let L = `<h1>Online</h1><p class="sub">A match every hour on the hour. Up to eight players; the AI takes every empty seat.</p>`;
    if (st.err) L += `<div class="olerr">${esc(st.err)}</div>`;
    if (!me) {
      L += `<div class="olbox"><b>Sign in</b>`;
      L += !st.codeSent
        ? `<form data-ol="sendcode"><input id="olEmail" type="email" autocomplete="email" placeholder="Your email address" value="${esc(st.email)}" maxlength="254"><button class="big alt" data-ol="sendcode">Email me a code</button></form>`
        : `<form data-ol="verify"><p class="tiny">We sent a 6-digit code to <b>${esc(st.email)}</b>.</p><input id="olCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code"><button class="big" data-ol="verify">Sign in</button><button class="small" type="button" data-ol="again">Use another address</button></form>`;
      const ps = cfg.signIns.filter((p) => p !== 'email');
      if (ps.length) L += `<div class="olor">or</div>${ps.map((p) => `<a class="big alt olprov" href="/api/auth/${p}/start">Sign in with ${PROVIDER_LABEL[p]}</a>`).join('')}`;
      if (cfg.dev) L += `<form data-ol="dev" class="oldev"><input id="olDev" placeholder="Test player name" maxlength="16"><button class="small" data-ol="dev">Test sign-in</button></form>`;
      L += `</div>`;
    } else if (me.needsName) {
      L += `<div class="olbox"><b>Choose your name</b><p class="tiny">3 to 16 letters, digits, _ or -. Others see it in matches and the league.</p><form data-ol="name"><input id="olName" maxlength="16" autocomplete="nickname"><button class="big" data-ol="name">Use this name</button></form></div>`;
    } else if (s) {
      const n = s.next, seated = n.you, full = n.seats.length >= n.houses;
      L += `<div class="olbox"><div class="olnext"><span>Next match</span><b>${clock(n.startsAt)}</b><span>in <b id="olCount">${left(n.startsAt - Date.now())}</b></span></div>`;
      L += `<div class="olseats">${n.seats.length ? n.seats.map((x) => `<span class="olseat${x.name === me.username ? ' you' : ''}">${esc(x.name)}</span>`).join('') : '<i>Nobody has signed up yet.</i>'}<span class="tiny">${n.seats.length} of ${n.houses} · the AI plays the rest</span></div>`;
      if (s.live) L += `<button class="big" data-ol="play">Your match is on: rejoin</button>`;
      else if (seated) L += `<p class="tiny">You are in. Keep this page open: the match starts on the hour, and you join it automatically.</p><button class="big alt" data-ol="leave">Leave this match</button>`;
      else if (!n.open) L += `<p class="tiny">Sign-up opens at ${clock(n.opensAt)}.</p>`;
      else L += `<button class="big" data-ol="join" ${full ? 'disabled' : ''}>${full ? 'This match is full' : 'Join this match'}</button>`;
      L += `</div>`;
    }
    L += `<button class="big alt" data-ol="back">Back to the menu</button>`;
    if (me && !me.needsName) L += `<p class="tiny olacct">Signed in as <b>${esc(me.username)}</b> · <button class="link" data-ol="logout">Sign out</button> · <button class="link" data-ol="delete">Delete my account</button></p>`;
    L += `<p class="tiny">Messages between players are chosen from a fixed list: there is no free chat.</p>`;

    let R = `<div class="olhead"><h2>League</h2><div class="seg"><button data-ol="season" data-v="${month()}" class="${st.season !== 'all' ? 'on' : ''}">This month</button><button data-ol="season" data-v="all" class="${st.season === 'all' ? 'on' : ''}">All time</button></div></div>`;
    R += `<table class="oltable"><thead><tr><th>#</th><th>Player</th><th class="n">Points</th><th class="n">Played</th><th class="n">Wins</th><th class="n">Best</th>${me ? '<th></th>' : ''}</tr></thead><tbody>`;
    R += st.league.length ? st.league.map((r) => `<tr class="${me && r.name === me.username ? 'you' : ''}"><td>${r.rank}</td><td>${esc(r.name)}</td><td class="n">${r.points}</td><td class="n">${r.played}</td><td class="n">${r.wins}</td><td class="n">${r.best}</td>${me ? `<td>${r.name !== me.username && !/^Fallen house/.test(r.name) ? `<button class="link" data-ol="report" data-v="${esc(r.name)}" title="Report this name as offensive">report</button>` : ''}</td>` : ''}</tr>`).join('')
      : `<tr><td colspan="7"><i>No matches finished ${st.season === 'all' ? 'yet' : 'this month'}.</i></td></tr>`;
    R += `</tbody></table><p class="tiny">Points: 100, 70, 50, 35, 25, 15, 10, 5 by place; +15 for every other player you finish above; +50 for a conquest. <a href="/league" target="_blank" rel="noopener">League page</a></p>`;
    if (st.recent.length) R += `<h2>Recent matches</h2>${st.recent.slice(0, 5).map((m) => `<div class="olrecent"><b>${clock(m.startsAt)}</b> ${new Date(m.startsAt).toLocaleDateString()} · ${m.reason === 'conquest' ? 'conquest' : m.reason === 'cap' ? 'two hours' : 'all players fell'} · ${m.places.filter((p) => p.name).map((p) => `${p.place}. ${esc(p.name)} (+${p.points})`).join(', ')}</div>`).join('')}`;
    // the screen is redrawn every few seconds: what the player is typing (and where) must survive it
    const keep = {}, act = document.activeElement, focusId = act && act.id && act.tagName === 'INPUT' ? act.id : null, sel = focusId ? [act.selectionStart, act.selectionEnd] : null;
    for (const el of $('olLeft').querySelectorAll('input[id]')) keep[el.id] = el.value;
    $('olLeft').innerHTML = L; $('olRight').innerHTML = R;
    for (const [id, val] of Object.entries(keep)) { const el = $(id); if (el && !el.value) el.value = val; }
    if (focusId && $(focusId)) { const el = $(focusId); el.focus(); try { if (sel[0] != null) el.setSelectionRange(sel[0], sel[1]); } catch {} }
  }

  async function onClick(e) {
    const b = e.target.closest?.('[data-ol]'); if (!b || st.busy) return;
    const act = b.dataset.ol, v = (id) => ($(id)?.value || '').trim();
    if (b.tagName === 'BUTTON' && b.type !== 'button' && b.closest('form')) e.preventDefault?.();
    st.busy = true; st.err = '';
    try {
      if (act === 'back') { back(); return; }
      if (act === 'sendcode') { st.email = v('olEmail'); await api('/api/auth/email/start', { method: 'POST', body: { email: st.email } }); st.codeSent = true; }
      else if (act === 'again') st.codeSent = false;
      else if (act === 'verify') { await api('/api/auth/email/verify', { method: 'POST', body: { email: st.email, code: v('olCode') } }); st.codeSent = false; }
      else if (act === 'dev') await api('/api/auth/dev', { method: 'POST', body: { name: v('olDev') } });
      else if (act === 'name') await api('/api/me/username', { method: 'POST', body: { username: v('olName') } });
      else if (act === 'join') await api('/api/join', { method: 'POST', body: {} });
      else if (act === 'leave') await api('/api/leave', { method: 'POST', body: {} });
      else if (act === 'play') { await play(); return; }
      else if (act === 'logout') await api('/api/auth/logout', { method: 'POST', body: {} });
      else if (act === 'delete') {
        const typed = prompt('Delete your account? Your email address and sign-ins are removed and cannot be brought back. Your matches stay in the league as "Fallen house". Type DELETE to confirm.');
        if (typed !== 'DELETE') return;
        await api('/api/me/delete', { method: 'POST', body: { confirm: 'DELETE' } });
      } else if (act === 'season') { st.season = b.dataset.v; }
      else if (act === 'report') { if (!confirm(`Report the name "${b.dataset.v}" as offensive? The owner will look at it.`)) return; await api('/api/report', { method: 'POST', body: { username: b.dataset.v } }); ui.toast('Thank you. The name has been reported.', 'info'); }
      await refresh(true);
    } catch (err) { st.err = err.message; draw(); }
    finally { st.busy = false; }
  }

  // ---- the Herald: preset messages during a match ---------------------------------------------------------------------------------
  const muted = new Set(), feed = [];
  let pick = null;   // the message waiting for its house
  const H = $('herald'), btn = $('btnHerald');
  btn.onclick = () => { H.classList.toggle('hidden'); pick = null; drawHerald(); };
  H.addEventListener('click', (e) => {
    const b = e.target.closest('[data-hd]'); if (!b) return;
    const net = getNet(), d = b.dataset;
    if (d.hd === 'msg') { const q = QUICK.find((x) => x.id === d.v); if (q.house) { pick = q.id; drawHerald(); return; } send(q.id, null); }
    else if (d.hd === 'house') send(pick, +d.v);
    else if (d.hd === 'to') { H.dataset.to = d.v; drawHerald(); }
    else if (d.hd === 'close') H.classList.add('hidden');
    function send(id, house) { const to = +(H.dataset.to ?? -1); net?.say(id, house, to); pick = null; H.classList.add('hidden'); }
  });
  $('heraldFeed').addEventListener('click', (e) => { const b = e.target.closest('[data-mute]'); if (!b) return; const s = +b.dataset.mute; if (muted.has(s)) muted.delete(s); else muted.add(s); drawFeed(); });
  function houseName(g, t) { return g?.players[t]?.name || HOUSES[t]?.name || `House ${t + 1}`; }
  function playerName(t) { const n = getNet()?.config?.names?.[t]; return n || null; }
  function drawHerald() {
    const g = getGame(), net = getNet(); if (!g || !net) return;
    const to = +(H.dataset.to ?? -1), people = (g.humans || []).filter((t) => t !== PLAYER);
    let h = `<div class="hdhead"><b>Herald</b><button class="link" data-hd="close">close</button></div>`;
    h += `<div class="hdto"><span>To</span><button class="small ${to === -1 ? 'on' : ''}" data-hd="to" data-v="-1">Everyone</button>${people.map((t) => `<button class="small ${to === t ? 'on' : ''}" data-hd="to" data-v="${t}" style="border-color:${HOUSES[t].accent}">${esc(playerName(t) || houseName(g, t))}</button>`).join('')}</div>`;
    if (pick) {
      h += `<p class="tiny">${esc(quickText(pick, '…'))} Which house?</p><div class="hdgrid">${g.players.filter((p) => p.alive && p.team !== PLAYER).map((p) => `<button class="small" data-hd="house" data-v="${p.team}" style="border-color:${HOUSES[p.team].accent}">${esc(houseName(g, p.team))}</button>`).join('')}</div>`;
    } else h += `<div class="hdgrid">${QUICK.map((q) => `<button class="small" data-hd="msg" data-v="${q.id}">${esc(quickText(q.id, '…'))}</button>`).join('')}</div>`;
    H.innerHTML = h;
  }
  function drawFeed() {
    const g = getGame(), now = Date.now();
    while (feed.length && now - feed[0].at > 60000) feed.shift();
    $('heraldFeed').innerHTML = feed.filter((m) => !muted.has(m.from)).slice(-5).map((m) => `<div class="hdmsg" style="border-left-color:${HOUSES[m.from]?.accent || '#c9a42e'}"><b>${esc(playerName(m.from) || houseName(g, m.from))}</b>${m.to >= 0 ? ' <i>(to you)</i>' : ''}: ${esc(quickText(m.id, m.house != null ? houseName(g, m.house) : ''))} <button class="link" data-mute="${m.from}" title="Hide messages from this player">mute</button></div>`).join('')
      + (muted.size ? `<div class="tiny">Muted: ${[...muted].map((t) => `<button class="link" data-mute="${t}">${esc(playerName(t) || houseName(g, t))}</button>`).join(', ')}</div>` : '');
  }
  setInterval(drawFeed, 5000);
  out.herald.said = (m) => { feed.push({ ...m, at: Date.now() });   // (our own messages come back too, so the sender sees what went out)
    if (!muted.has(m.from) && m.from !== PLAYER) ui.toast(`${playerName(m.from) || houseName(getGame(), m.from)}: ${quickText(m.id, m.house != null ? houseName(getGame(), m.house) : '')}`, 'info'); drawFeed(); };
  out.herald.show = (on) => { btn.classList.toggle('hidden', !on); if (!on) H.classList.add('hidden'); };

  // ---- the end of an hourly match: where everyone finished, and the points --------------------------------------------------------
  out.showResult = (r) => {
    const g = getGame(), mine = r.places.find((p) => p.team === PLAYER);
    $('endTitle').textContent = !mine ? 'The match is over.' : mine.place === 1 ? (mine.conquest ? 'The valley is yours.' : 'First when the horn sounded.') : `You finished ${mine.place}${['th', 'st', 'nd', 'rd'][mine.place % 10 > 3 || [11, 12, 13].includes(mine.place % 100) ? 0 : mine.place % 10]}.`;
    $('endText').textContent = `${r.reason === 'conquest' ? 'One house conquered the valley' : r.reason === 'cap' ? 'Time was up: the standings decided' : r.reason === 'fallen' ? 'Every player\'s house had fallen' : 'The match ended'} (${r.gameTime >= 120 ? `${Math.floor(r.gameTime / 60)} min` : `${r.gameTime} s`}).${mine ? ` You earned ${mine.points} league point${mine.points === 1 ? '' : 's'}.` : ''}`;
    let ch = $('endChron'); if (!ch) { ch = document.createElement('div'); ch.id = 'endChron'; $('endText').after(ch); }
    ch.className = 'olplaces';
    ch.innerHTML = `<table class="oltable"><thead><tr><th>Place</th><th>House</th><th>Player</th><th class="n">Points</th></tr></thead><tbody>${r.places.map((p) => `<tr class="${p.team === PLAYER ? 'you' : ''}"><td>${p.place}${p.conquest ? ' (conquest)' : ''}</td><td style="color:${HOUSES[p.team]?.accent}">${esc(houseName(g, p.team))}</td><td>${p.name ? esc(p.name) : '<i>AI</i>'}${p.name && !p.joined ? ' <i>(did not come)</i>' : ''}</td><td class="n">${p.points || ''}</td></tr>`).join('')}</tbody></table>`;
    $('eNew').textContent = 'Back to the online menu'; $('eNew').onclick = () => { location.href = '/?online=1'; };
    $('end').classList.remove('hidden'); ui.endShown = true;
  };

  if (new URLSearchParams(location.search).get('online') === '1') { $('splash')?.classList.add('gone', 'hidden'); out.open(); }
  else refresh(false);
  return out;
}
