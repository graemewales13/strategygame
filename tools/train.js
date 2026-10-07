// Auld World - offline trainer. Put recording files exported from the menu ("Export recordings") into data/recordings/ and run:
//   node tools/train.js            -> merges them into data/features.json (the shipped training set the game loads) and prints the playbook
// Commit data/features.json and every player of the game starts with rivals that already play the way you did.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { learnPlaybook, usable, TRAINED_AT } from '../js/learn.js';

const DIR = new URL('../data/recordings/', import.meta.url), FEATS = new URL('../data/features.json', import.meta.url), OUT = new URL('../data/playbook.json', import.meta.url);
const have = existsSync(FEATS) ? (JSON.parse(readFileSync(FEATS, 'utf8')).records || []) : [];
const ids = new Set(have.map((r) => r.id));
let added = 0, skipped = 0;
for (const f of existsSync(DIR) ? readdirSync(DIR).filter((n) => n.endsWith('.json')) : []) {
  let d; try { d = JSON.parse(readFileSync(new URL(f, DIR), 'utf8')); } catch { console.log('skip (bad JSON):', f); continue; }
  const list = Array.isArray(d) ? d : Array.isArray(d?.records) ? d.records : d?.v === 1 ? [d] : [];
  for (const r of list) { if (!r || r.id == null || ids.has(r.id) || !usable(r) || r.result === 'live') { skipped++; continue; } have.push(r); ids.add(r.id); added++; }
}
have.sort((a, b) => (a.at || 0) - (b.at || 0));
writeFileSync(FEATS, JSON.stringify({ app: 'auld-world', kind: 'recordings', records: have }));
const pb = learnPlaybook(have);
writeFileSync(OUT, JSON.stringify(pb, null, 1));
console.log(`recordings: ${have.length} (+${added} new, ${skipped} skipped)`);
if (!pb) { console.log('no usable matches yet: nothing learned.'); process.exit(0); }
console.log(`learned from ${pb.matches} matches (${pb.wins} won): confidence ${Math.round(pb.conf * 100)}%${pb.trained ? ' - TRAINED' : ' (trained at ' + TRAINED_AT * 100 + '%)'}`);
console.log('build order :', pb.plan.slice(0, 14).map((e) => `${e.k}#${e.n}@${e.t}s`).join(' '));
console.log('army curve  :', pb.army.slice(0, 20).map((v) => v.toFixed(0)).join(' '), `(every ${pb.step}s)`);
console.log('unit mix    :', JSON.stringify(pb.mix), ' attack:', JSON.stringify(pb.attack), ' war at:', pb.warAt, ' camels:', JSON.stringify(pb.camels));
