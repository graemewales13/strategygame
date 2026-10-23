// Auld World - the network seam.
//
// Single-player: LocalHost hands each order (an INTENT) straight to the Game in this tab.
//
// Online (groundwork, see relay.js): LOCKSTEP, the way most RTS games do it. Every player runs the same Game on their own machine.
// Only orders cross the network:
//   * the relay keeps a turn clock (NET.turnMs). It gathers the orders sent during a turn, stamps each with the sender's seat
//     (a client can never order another seat's people), and broadcasts the turn to everyone: { n, intents }.
//   * every client applies turn n's orders, then advances the simulation by NET.ticksPerTurn fixed ticks of NET.dt. The simulation
//     is deterministic (seeded game.rnd/roll, no Math.random, fixed dt), so every copy stays identical.
//   * every NET.hashEvery turns each client sends a fingerprint of its state (stateHash); the relay compares them and reports a desync.
//   * a dropped player rejoins with their token: the relay sends the match config and every turn so far, and the client replays them.
// Rules of the simulation must never depend on PLAYER (the seat at this screen) - only on game.humans - or the copies drift apart.
//
// Intent shapes (the relay adds { team }):
//   { type:'move', ids, x, y }            { type:'context', ids, x, y }   // right-click, host decides
//   { type:'attack'|'pillage', ids, targetId }   { type:'infiltrate', ids, villageId }
//   { type:'gather', ids, nodeId }        { type:'build', ids, buildingId }
//   { type:'place', kind, tx, ty, ids }   { type:'train', buildingId, kind }
//   { type:'cancel', buildingId, index }  { type:'rally', buildingId, x, y, nodeId }
//   { type:'trade', partner:{type,id}, give, get, amount }
//   { type:'relation', other, state }     { type:'stop', ids }
//   { type:'amove', ids, x, y }           // attack-move: fight every foe met on the way
//   { type:'stance', ids, stance }        // aggressive | defensive | hold | passive
//   { type:'formation', ids, form }       // mass | line | box | loose (idle members form up where they stand)
//   { type:'place', kind:'mine', nodeId }  { type:'mine', ids, buildingId }  { type:'unmine', buildingId }
//   { type:'respond', from, accept }      // answer a treaty offer
//   { type:'research', tech }  { type:'craft'|'uncraft', buildingId, item|index }  { type:'demolish', buildingId }
//
// Messages (JSON). Client -> relay:
//   { t:'hello', room, name, build, token? }   join (or rejoin with the token from 'welcome')
//   { t:'config', config }                      the room's host sets seed, houses, diff, people, size, fog, playbook (before start)
//   { t:'start' }                               the room's host starts the match
//   { t:'intent', intent }                      an order for this player's seat
//   { t:'hash', n, h }                          state fingerprint after turn n
// Relay -> client:
//   { t:'welcome', seat, host, token, room, members, config }   { t:'lobby', members, config }
//   { t:'start', config }                       config.humans lists the seats people play; the rest are AI
//   { t:'turn', n, intents }                    { t:'catchup', config, turns:[[n, intents]...], now }
//   { t:'desync', n, hashes }                   { t:'error', msg }

export const NET = { version: 1, turnMs: 100, ticksPerTurn: 2, dt: 0.05, hashEvery: 10, maxPerFrame: 30 };

/** Same-process host: intents go straight into the sim. */
export class LocalHost {
  constructor(game) { this.game = game; this.team = 0; }
  send(intent) { return this.game.applyIntent({ ...intent, team: this.team }); }
  onSnapshot() { /* single-player: the client reads game state directly */ }
}

// A cheap fingerprint of everything that decides the match: time, the random streams, every person, building, village and purse.
// (Logs, sounds and floating numbers are per screen and left out.)
export function stateHash(g) {
  let h = 0x811c9dc5;
  const add = (v) => { const s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(5)) : String(v); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } h ^= 124; h = Math.imul(h, 0x01000193) >>> 0; };
  add(g.time); add(g.rndA ?? 0); add(g.rollA ?? 0);
  for (const u of g.units) { add(u.id); add(u.kind); add(u.team); add(u.x); add(u.y); add(u.hp); add(u.task?.type || ''); add(u.inside ?? -1); }
  for (const b of g.buildings) { add(b.id); add(b.kind); add(b.team); add(b.hp); add(b.built); }
  for (const v of g.villages) { add(v.id); add(v.owner); add(v.loyalty); add(v.pop); }
  for (const p of g.players) { add(p.team); add(p.alive ? 1 : 0); add(p.gold); add(p.food); add(p.wood); add(p.stone || 0); }
  for (const row of g.rel || []) for (const r of row) add(r);
  return h.toString(16);
}

/**
 * Lockstep client. Browser: new LockstepClient({ url: 'ws://host:8080/ws', room, name, build }). Node (tests): pass WebSocketImpl.
 * Hooks: onLobby(msg), onStart(config), onDesync(msg), onError(msg), onClose().
 */
export class LockstepClient {
  constructor({ url, room, name = 'Player', build = '', token = null, ticket = null, WebSocketImpl = globalThis.WebSocket }) {
    Object.assign(this, { url, room, name, build, token, ticket, WS: WebSocketImpl });   // ticket: an hourly match (server/match.js); room/token: an open room (relay.js)
    this.pendingSnap = null; this.resyncs = 0; this.result = null; this.phase = null;
    this.onResync = this.onSaid = this.onEnd = () => {};
    this.seat = -1; this.isHost = false; this.config = null; this.members = [];
    this.game = null; this.turns = new Map(); this.next = 0; this.latest = -1; this.desynced = null; this.started = false;
    this.onLobby = this.onStart = this.onDesync = this.onError = this.onClose = () => {};
  }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = (this.ws = new this.WS(this.url));
      ws.onopen = () => this.raw({ t: 'hello', room: this.room, name: this.name, build: this.build, token: this.token, ticket: this.ticket || undefined, v: NET.version });
      ws.onerror = (e) => reject(e?.error || new Error('could not reach the relay'));
      ws.onclose = () => this.onClose();
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(typeof e.data === 'string' ? e.data : String(e.data)); } catch { return; }
        this.receive(m);
        if (m.t === 'welcome') resolve(m);
        if (m.t === 'error' && this.seat < 0) reject(new Error(m.msg));
      };
    });
  }
  raw(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  receive(m) {
    switch (m.t) {
      case 'welcome': this.seat = m.seat; this.isHost = !!m.host; this.token = m.token ?? this.token; this.members = m.members || []; this.config = m.config; this.phase = m.phase ?? null; break;
      case 'lobby': this.members = m.members; if (m.config) this.config = m.config; this.isHost = !!m.members.find((x) => x.you)?.host; this.onLobby(m); break;
      case 'start': this.config = m.config; this.started = true; this.turns.clear(); this.next = 0; this.latest = -1; this.onStart(m.config); break;
      case 'catchup':   // a rejoin. An hourly match sends the referee's state (snap, after turn n); an open room, every turn so far to replay
        if (m.snap) {
          this.config = m.config; this.started = true; this.turns.clear(); this.pendingSnap = m.snap; this.next = m.n + 1; this.latest = m.n;
          if (this.game) this.attach(this.game);   // (already playing: take the state at once)
          this.onStart(m.config, { rejoin: true }); break;
        }
        this.config = m.config; this.started = true; this.turns.clear(); this.next = 0; this.latest = m.now - 1;
        for (let n = 0; n < m.now; n++) this.turns.set(n, []);
        for (const [n, intents] of m.turns) this.turns.set(n, intents);
        this.onStart(m.config, { rejoin: true }); break;
      case 'turn': this.turns.set(m.n, m.intents); this.latest = Math.max(this.latest, m.n); break;
      case 'desync': this.desynced = m; this.onDesync(m); break;
      case 'resync':   // this copy drifted from the referee's: take the referee's state (after turn n) and carry on from the next turn
        if (this.game) this.game.restore(m.snap); else this.pendingSnap = m.snap;
        for (const k of [...this.turns.keys()]) if (k <= m.n) this.turns.delete(k);
        this.next = m.n + 1; this.latest = Math.max(this.latest, m.n); this.resyncs++; this.desynced = null; this.onResync(m); break;
      case 'said': this.onSaid(m); break;   // a preset message: { from, id, house, to }; the words come from js/online.js QUICK
      case 'end': this.result = m.result; this.onEnd(m.result); break;   // an hourly match is over: placings and points
      case 'error': this.onError(m); break;
    }
  }
  // the screen's orders: sent to the relay, applied when their turn comes back (so every copy applies them at the same moment)
  send(intent) { const { team, ...rest } = intent; this.raw({ t: 'intent', intent: rest }); return true; }
  configure(config) { this.raw({ t: 'config', config }); }
  start() { this.raw({ t: 'start' }); }
  attach(game) { this.game = game; if (this.pendingSnap) { game.restore(this.pendingSnap); this.pendingSnap = null; } }
  // a preset message (js/online.js QUICK): its id, the house it names (a seat number) if it names one, and to whom (-1: everyone)
  say(id, house = null, to = -1) { this.raw({ t: 'say', id, house: house ?? undefined, to }); }
  behind() { return this.latest - this.next + 1; }
  /** Apply every turn that has arrived, in order (at most `max` this call). Returns how many were applied. */
  step(max = NET.maxPerFrame) {
    let done = 0;
    while (this.game && done < max && this.turns.has(this.next)) {
      const n = this.next, intents = this.turns.get(n);
      this.turns.delete(n);
      for (const it of intents) this.game.applyIntent(it);
      for (let k = 0; k < NET.ticksPerTurn; k++) this.game.tick(NET.dt);
      if (n % NET.hashEvery === 0) this.raw({ t: 'hash', n, h: stateHash(this.game) });
      this.next++; done++;
    }
    return done;
  }
  close() { try { this.ws?.close(); } catch {} }
}
