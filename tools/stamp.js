// Cache-bust the game's ES modules: rewrites the import map and main.js tag in index.html with a fresh version.
// Browsers cache modules by URL, so a stale js/config.js next to a new js/game.js makes the whole game fail to start.
// Run `node tools/stamp.js` before every push that changes anything in js/.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const v = Date.now().toString(36), files = readdirSync(new URL('../js/', import.meta.url)).filter((f) => f.endsWith('.js'));
const map = JSON.stringify({ imports: Object.fromEntries(files.map((f) => [`./js/${f}`, `./js/${f}?v=${v}`])) }, null, 2);
const p = new URL('../index.html', import.meta.url); let s = readFileSync(p, 'utf8');
s = s.replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, '');
s = s.replace('<script>\n// Before the game code', `<script type="importmap">\n${map}\n</script>\n<script>\n// Before the game code`);
s = s.replace(/window\.__BUILD = '[^']*';/, `window.__BUILD = '${v}';`);
writeFileSync(p, s); console.log('stamped', v);
