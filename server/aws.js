// Calling AWS without the AWS SDK (so the servers stay free of npm packages): request signing (Signature Version 4), the credentials of
// the server's own role (the EC2 instance metadata service, version 2; or AWS_* environment variables), and sending one email with SES.
import { createHash, createHmac } from 'node:crypto';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const hmac = (k, s) => createHmac('sha256', k).update(s).digest();
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// Sign a request. req: { method, url, headers: {name: value}, body }. creds: { accessKeyId, secretAccessKey, sessionToken? }.
// Returns the headers to send (the given ones plus x-amz-date, x-amz-security-token and authorization). now: a Date (tests pass one).
export function signV4(req, creds, region, service, now = new Date()) {
  const u = new URL(req.url), amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''), day = amzDate.slice(0, 8), body = req.body ?? '';
  const headers = { ...req.headers, host: u.host, 'x-amz-date': amzDate };
  if (creds.sessionToken) headers['x-amz-security-token'] = creds.sessionToken;
  const names = Object.keys(headers).map((k) => k.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')]));
  const query = [...u.searchParams].map(([k, v]) => [enc(k), enc(v)]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&');
  const path = u.pathname.split('/').map((p) => enc(decodeURIComponent(p))).join('/') || '/';
  const canonical = [req.method, path, query, names.map((n) => `${n}:${lower[n]}\n`).join(''), names.join(';'), sha(body)].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${creds.secretAccessKey}`, day), region), service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

// The server's credentials: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (/ AWS_SESSION_TOKEN) if set, else the instance role through the
// metadata service (IMDSv2: a token first). Cached until five minutes before they expire. (A pod reaches the metadata service because the
// instance's hop limit is 2: see deploy/terraform.)
export function awsCredentials({ env = process.env, f = fetch, imds = 'http://169.254.169.254' } = {}) {
  let cached = null;
  return async () => {
    if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) return { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY, sessionToken: env.AWS_SESSION_TOKEN };
    if (cached && cached.until > Date.now()) return cached.creds;
    const t = await f(`${imds}/latest/api/token`, { method: 'PUT', headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '21600' }, signal: AbortSignal.timeout(3000) });
    if (!t.ok) throw new Error(`the instance metadata service answered ${t.status}`);
    const token = await t.text(), h = { 'X-aws-ec2-metadata-token': token };
    const roleR = await f(`${imds}/latest/meta-data/iam/security-credentials/`, { headers: h, signal: AbortSignal.timeout(3000) });
    const role = (await roleR.text()).split('\n')[0].trim();
    if (!roleR.ok || !role) throw new Error('this server has no AWS role');
    const c = await (await f(`${imds}/latest/meta-data/iam/security-credentials/${role}`, { headers: h, signal: AbortSignal.timeout(3000) })).json();
    const creds = { accessKeyId: c.AccessKeyId, secretAccessKey: c.SecretAccessKey, sessionToken: c.Token };
    cached = { creds, until: new Date(c.Expiration).getTime() - 5 * 60e3 };
    return creds;
  };
}

// Send one plain-text email with SES (API v2, SendEmail). Throws with SES's reason if it refuses.
export async function sesSend({ region, from, to, subject, text, creds, f = fetch }) {
  const url = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;
  const body = JSON.stringify({ FromEmailAddress: from, Destination: { ToAddresses: [to] }, Content: { Simple: { Subject: { Data: subject, Charset: 'UTF-8' }, Body: { Text: { Data: text, Charset: 'UTF-8' } } } } });
  const headers = signV4({ method: 'POST', url, headers: { 'content-type': 'application/json' }, body }, await creds(), region, 'ses');
  const r = await f(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) });
  if (!r.ok) { let why = ''; try { why = (await r.json()).message || ''; } catch {} throw new Error(`SES answered ${r.status}${why ? `: ${why}` : ''}`); }
}
