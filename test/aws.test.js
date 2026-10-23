// Talking to AWS without the SDK (server/aws.js): request signing against AWS's own published example, the instance role's credentials
// through the metadata service (IMDSv2), and an email to a stand-in SES. `node test/aws.test.js` (part of `npm test`).
import assert from 'node:assert/strict';
import { signV4, awsCredentials, sesSend } from '../server/aws.js';
import { makeMailer } from '../server/mail.js';

let passed = 0;
const test = async (name, fn) => { try { await fn(); passed++; console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.stack.split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };

await test('signing: AWS\'s worked example (IAM ListUsers, 2015-08-30) gives AWS\'s published signature', () => {
  const h = signV4({ method: 'GET', url: 'https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08', headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' }, body: '' },
    { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' }, 'us-east-1', 'iam', new Date('2015-08-30T12:36:00Z'));
  assert.equal(h.authorization, 'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/iam/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7');
  assert.equal(h['x-amz-date'], '20150830T123600Z');
});

await test('credentials: from the instance metadata service with a token first (IMDSv2), cached until near expiry; environment keys win', async () => {
  const calls = [];
  const f = async (url, o = {}) => {
    calls.push(`${o.method || 'GET'} ${new URL(url).pathname}`);
    if (url.endsWith('/api/token')) { assert.equal(o.headers['X-aws-ec2-metadata-token-ttl-seconds'], '21600'); return new Response('tok'); }
    assert.equal(o.headers['X-aws-ec2-metadata-token'], 'tok');
    if (url.endsWith('/security-credentials/')) return new Response('auld-node\n');
    return Response.json({ AccessKeyId: 'ASIA1', SecretAccessKey: 's', Token: 't', Expiration: new Date(Date.now() + 3600e3).toISOString() });
  };
  const get = awsCredentials({ env: {}, f });
  assert.deepEqual(await get(), { accessKeyId: 'ASIA1', secretAccessKey: 's', sessionToken: 't' });
  await get();
  assert.deepEqual(calls, ['PUT /latest/api/token', 'GET /latest/meta-data/iam/security-credentials/', 'GET /latest/meta-data/iam/security-credentials/auld-node'], 'asked once, then cached');
  assert.equal((await awsCredentials({ env: { AWS_ACCESS_KEY_ID: 'AK', AWS_SECRET_ACCESS_KEY: 'SK' }, f: () => { throw new Error('not asked'); } })()).accessKeyId, 'AK');
});

await test('email: SES v2 SendEmail, signed for ses in the region, with the session token; a refusal says why', async () => {
  let seen = null;
  const f = async (url, o) => { seen = { url, o }; return url.includes('fail') ? new Response(JSON.stringify({ message: 'Email address is not verified.' }), { status: 400 }) : new Response('{}'); };
  const creds = async () => ({ accessKeyId: 'ASIA1', secretAccessKey: 's', sessionToken: 'tok' });
  await sesSend({ region: 'eu-west-2', from: 'Auld World <no-reply@example.com>', to: 'ann@example.com', subject: 'Code', text: 'Your code is 123456', creds, f });
  assert.equal(seen.url, 'https://email.eu-west-2.amazonaws.com/v2/email/outbound-emails');
  assert.match(seen.o.headers.authorization, /^AWS4-HMAC-SHA256 Credential=ASIA1\/\d{8}\/eu-west-2\/ses\/aws4_request, SignedHeaders=content-type;host;x-amz-date;x-amz-security-token, Signature=[0-9a-f]{64}$/);
  assert.equal(seen.o.headers['x-amz-security-token'], 'tok');
  const body = JSON.parse(seen.o.body);
  assert.deepEqual(body.Destination.ToAddresses, ['ann@example.com']); assert.equal(body.Content.Simple.Body.Text.Data, 'Your code is 123456');
  const m = makeMailer({ mode: 'ses', from: 'no-reply@example.com', region: 'eu-west-2', creds, f: async (url, o) => f(url + '?fail', o) });
  await assert.rejects(m.send('x@example.com', 's', 't'), /not verified/);
  assert.throws(() => makeMailer({ mode: 'ses' }), /MAIL_FROM/);
});

console.log(`${passed} passed`);
