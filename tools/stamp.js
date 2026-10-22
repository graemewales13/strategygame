// Cache-bust the game's ES modules: rewrites the import map and main.js tag in index.html with a fresh version.
// Browsers cache modules by URL, so a stale js/config.js next to a new js/game.js makes the whole game fail to start.
// Run `node tools/stamp.js` before every push that changes anything in js/.
// Works on a CRLF checkout too (Windows): on 2026-10-13 a stamp there removed the import map and never wrote it back (T-055).
// It refuses to write a file it could not stamp completely.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const v = Date.now().toString(36), files = readdirSync(new URL('../js/', import.meta.url)).filter((f) => f.endsWith('.js')).sort();
const map = JSON.stringify({ imports: Object.fromEntries(files.map((f) => [`./js/${f}`, `./js/${f}?v=${v}`])) }, null, 2);
const p = new URL('../index.html', import.meta.url), raw = readFileSync(p, 'utf8'), crlf = raw.includes('\r\n');
let s = raw.replace(/\r\n/g, '\n');
s = s.replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, '');
const anchor = '<script>\n// Before the game code';
if (!s.includes(anchor)) { console.error('stamp: could not find the boot script in index.html; nothing written'); process.exit(1); }
s = s.replace(/\n{3,}(?=<script>\n\/\/ Before the game code)/, '\n\n');   // (earlier stamps left a growing run of blank lines here)
s = s.replace(anchor, `<script type="importmap">\n${map}\n</script>\n${anchor}`);
s = s.replace(/window\.__BUILD = '[^']*';/, `window.__BUILD = '${v}';`);
s = s.replace(/href="style\.css(\?v=[^"]*)?"/, `href="style.css?v=${v}"`);
if (!s.includes(`"./js/main.js": "./js/main.js?v=${v}"`) || !s.includes(`window.__BUILD = '${v}'`)) { console.error('stamp: index.html did not take the stamp; nothing written'); process.exit(1); }
writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s); console.log('stamped', v);
