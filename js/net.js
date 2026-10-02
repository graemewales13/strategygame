// Auld World - network seam (STUB). Single-player ships first.
//
// The design is host-authoritative:
//   * the HOST owns the one Game object and ticks it;
//   * every CLIENT (including the local player) sends INTENTS and draws what it is told;
//   * the host applies intents via game.applyIntent() and broadcasts snapshots (game.snapshot()).
// There is no lockstep and no client-side prediction yet.
//
// Intent shapes (all carry { team }):
//   { type:'move', ids, x, y }            { type:'context', ids, x, y }   // right-click, host decides
//   { type:'attack'|'pillage', ids, targetId }   { type:'infiltrate', ids, villageId }
//   { type:'gather', ids, nodeId }        { type:'build', ids, buildingId }
//   { type:'place', kind, tx, ty, ids }   { type:'train', buildingId, kind }
//   { type:'cancel', buildingId, index }  { type:'rally', buildingId, x, y, nodeId }
//   { type:'trade', partner:{type,id}, give, get, amount }
//   { type:'relation', other, state }     { type:'stop', ids }
//   { type:'place', kind:'mine', nodeId }  { type:'mine', ids, buildingId }  { type:'unmine', buildingId }
//   { type:'respond', from, accept }      // answer a treaty offer
//   trade: give/get may be any good (grain, timber, coin, stone, copper, iron, coal, silver, steel, ware); camels trade at markets/villages under a treaty

/** Same-process host: intents go straight into the sim. */
export class LocalHost {
  constructor(game) { this.game = game; this.team = 0; }
  send(intent) { return this.game.applyIntent({ ...intent, team: this.team }); }
  onSnapshot() { /* single-player: the client reads game state directly */ }
}

/** Socket client stub. Wire `url` to a host that runs a Game and relays intents/snapshots. */
export class SocketClient {
  constructor(url, team) { this.url = url; this.team = team; this.ws = null; this.handlers = []; }
  connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onmessage = (e) => { const snap = JSON.parse(e.data); this.handlers.forEach((h) => h(snap)); };
  }
  send(intent) { this.ws?.send(JSON.stringify({ ...intent, team: this.team })); }
  onSnapshot(fn) { this.handlers.push(fn); }
}
