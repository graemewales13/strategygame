// The deployment files (deploy/k8s, deploy/host): rendered for each environment with nothing left unfilled, production never with the test
// sign-in, the database copied to the right place, the front door's routes, and the server's deploy script refusing bad input.
// `node test/deploy.test.js` (part of `npm test`). (A real k3s run of all of it is described in TROUBLESHOOTING T-093.)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderApp, renderEdge, render } from '../deploy/k8s/render.mjs';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.stack.split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const img = 'ghcr.io/graemewales13/auld-world@sha256:' + 'a'.repeat(64);

test('production: every placeholder filled; its own namespace; the test sign-in off; real email possible; matches hourly with the two-hour cap', () => {
  const y = renderApp({ env: 'production', image: img, version: '1.0.7', host: 'game.example.com', bucket: 'auld-bucket', mail: 'ses', mailFrom: 'Auld World <play@example.com>' });
  assert.ok(!/\{\{/.test(y)); assert.match(y, /name: auld\n/); assert.match(y, /AUTH_DEV: "0"/); assert.match(y, /NODE_ENV: "production"/);
  assert.match(y, /PUBLIC_URL: "https:\/\/game\.example\.com"/); assert.match(y, /EVERY_MIN: "60"/); assert.match(y, /MATCH_CAP_S: "7200"/);
  assert.match(y, /type: s3\n\s+bucket: auld-bucket\n\s+path: db\/production\/auld\.db/); assert.ok(y.includes(`MATCH_IMAGE: "${img}"`) && y.includes(`image: ${img}`), 'the api and its matches run the same image');
  assert.match(y, /strategy: \{ type: Recreate \}/, 'never two copies on one database');
});

test('staging: its own namespace and database copy, the test sign-in on, shorter matches; bad input refused', () => {
  const y = renderApp({ env: 'staging', image: img, version: '1.0.7', host: 'staging.game.example.com', bucket: 'auld-bucket' });
  assert.match(y, /name: auld-staging\n/); assert.match(y, /AUTH_DEV: "1"/); assert.match(y, /path: db\/staging\/auld\.db/); assert.match(y, /MAIL: "console"/);
  assert.throws(() => renderApp({ env: 'prod', image: img, host: 'x.com', bucket: 'b-b-b' }), /production or staging/);
  assert.throws(() => renderApp({ env: 'staging', image: 'bad image', host: 'x.com', bucket: 'b-b-b' }), /--image/);
  assert.throws(() => renderApp({ env: 'staging', image: img, host: 'x.com/../y', bucket: 'b-b-b' }), /--host/);
  assert.throws(() => renderApp({ env: 'staging', image: img, host: 'x.com' }), /--bucket/);
  assert.throws(() => render('a {{X}} b', {}), /no value for \{\{X\}\}/);
});

test('front door: both sites; a match\'s WebSocket by id only (8 lowercase letters or digits) to its own Service; /internal/ closed; a new Caddyfile restarts Caddy', () => {
  const a = renderEdge({ prodSite: 'game.example.com', stagingSite: 'staging.game.example.com', acmeEmail: 'me@example.com' });
  const b = renderEdge({ prodSite: 'game.example.com', stagingSite: 'other.example.com', acmeEmail: 'me@example.com' });
  assert.ok(!/\{\{/.test(a)); assert.match(a, /game\.example\.com \{\n\s+import auld auld\n/); assert.match(a, /staging\.game\.example\.com \{\n\s+import auld auld-staging\n/);
  assert.match(a, /path_regexp m \^\/m\/\(\[a-z0-9\]\{8\}\)\/ws\$/); assert.match(a, /reverse_proxy @match match-\{re\.m\.1\}\.\{args\[0\]\}\.svc\.cluster\.local:8080/);
  assert.match(a, /@internal path \/internal\/\*\n\s+respond @internal 404/); assert.ok(!/hostNetwork: true/.test(a), 'an ordinary pod (T-093)');
  const hash = (y) => y.match(/auld\/caddyfile: "([0-9a-f]+)"/)[1];
  assert.notEqual(hash(a), hash(b));
});

test('the server\'s deploy script: strict shell, known targets only, a safe release name, the secrets from SSM, waits out the hour', () => {
  const s = readFileSync(new URL('../deploy/host/deploy.sh', import.meta.url), 'utf8');
  assert.match(s, /^#!\/bin\/sh\n/); assert.match(s, /\nset -eu\n/);
  assert.match(s, /case "\$TARGET" in production\) NS=auld ;; staging\) NS=auld-staging ;; edge\) NS=edge ;; \*\) echo "unknown target/);
  assert.match(s, /case "\$RELEASE" in \*\[!A-Za-z0-9\._-\]\*\|""\) echo "bad release name"; exit 2/);
  assert.match(s, /get-parameters-by-path --path "\/auld\/\$TARGET\/" --with-decryption/); assert.match(s, /58\|59\|00\|01\)/);
  assert.ok(!/\r\n/.test(s), 'Unix line endings (it runs on Linux)');
});

console.log(`${passed} passed`);
