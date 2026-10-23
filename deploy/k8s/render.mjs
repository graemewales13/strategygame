// Fill in the Kubernetes templates for one release (run by CI; the server only applies the result).
//   node deploy/k8s/render.mjs app  --env production|staging --image <ref> --version <v> --host <name> --bucket <s3> [--region eu-west-2]
//        [--mail ses|console] [--mail-from "Auld World <play@example.com>"] [--every-min 60] [--cap-s 7200]
//   node deploy/k8s/render.mjs edge --prod-site <site> --staging-site <site> --acme-email <address>
// A site is a host name for HTTPS (game.example.com) or http://<host> for plain HTTP (local tests). Every {{NAME}} must be filled.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
export function render(text, vars) {
  const out = text.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => { if (vars[k] === undefined || vars[k] === null) throw new Error(`no value for {{${k}}}`); return String(vars[k]); });
  if (/\{\{[A-Z_]+\}\}/.test(out)) throw new Error('a placeholder was left');
  return out;
}
const opt = (args, name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };

export function renderApp(o) {
  const env = o.env;
  if (!['production', 'staging'].includes(env)) throw new Error('--env must be production or staging');
  if (!/^[\w./:@-]+$/.test(o.image || '')) throw new Error('--image is needed');
  if (!/^[a-z0-9.-]{3,63}$/.test(o.bucket || '')) throw new Error('--bucket is needed (the S3 bucket, or file for a local test)');
  if (!/^[a-z0-9.-]+$/i.test(o.host || '') && !/^http:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o.host || '')) throw new Error('--host is needed (a host name, or http://host for plain HTTP)');
  const prod = env === 'production', publicUrl = o.host.startsWith('http://') ? o.host : `https://${o.host}`;
  return render(readFileSync(HERE + 'app.yaml', 'utf8'), {
    ENV: env, NAMESPACE: prod ? 'auld' : 'auld-staging', NODE_ENV: prod ? 'production' : 'staging', IMAGE: o.image, VERSION: o.version || 'dev',
    PUBLIC_URL: publicUrl,
    // where Litestream copies the database: the S3 bucket, or (--bucket file, local tests only) a folder on the same disk
    REPLICA: (o.bucket === 'file'
      ? ['          - type: file', '            path: /data/backup']
      : ['          - type: s3', `            bucket: ${o.bucket}`, `            path: db/${env}/auld.db`, `            region: ${o.region || 'eu-west-2'}`, '            retention: 168h']).join('\n'),
    REGION: o.region || 'eu-west-2', MAIL: o.mail || 'console', MAIL_FROM: o.mailFrom || '',
    AUTH_DEV: prod ? '0' : '1', EVERY_MIN: String(o.everyMin || (prod ? 60 : 15)), MATCH_CAP_S: String(o.capS || (prod ? 7200 : 900)),
  });
}
export function renderEdge(o) {
  for (const k of ['prodSite', 'stagingSite', 'acmeEmail']) if (!o[k]) throw new Error(`--${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())} is needed`);
  const vars = { PROD_SITE: o.prodSite, STAGING_SITE: o.stagingSite, ACME_EMAIL: o.acmeEmail, CADDY_HASH: 'x' };
  const once = render(readFileSync(HERE + 'edge.yaml', 'utf8'), vars);
  vars.CADDY_HASH = createHash('sha256').update(once.slice(once.indexOf('Caddyfile:'), once.indexOf('---', once.indexOf('Caddyfile:')))).digest('hex').slice(0, 12);   // (a new Caddyfile restarts Caddy)
  return render(readFileSync(HERE + 'edge.yaml', 'utf8'), vars);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [what, ...a] = process.argv.slice(2);
  try {
    if (what === 'app') process.stdout.write(renderApp({ env: opt(a, 'env'), image: opt(a, 'image'), version: opt(a, 'version'), host: opt(a, 'host'), bucket: opt(a, 'bucket'), region: opt(a, 'region'), mail: opt(a, 'mail'), mailFrom: opt(a, 'mail-from'), everyMin: opt(a, 'every-min'), capS: opt(a, 'cap-s') }));
    else if (what === 'edge') process.stdout.write(renderEdge({ prodSite: opt(a, 'prod-site'), stagingSite: opt(a, 'staging-site'), acmeEmail: opt(a, 'acme-email') }));
    else throw new Error('render app ... or render edge ...');
  } catch (e) { console.error(`render: ${e.message}`); process.exit(2); }
}
