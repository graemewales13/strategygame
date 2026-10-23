// Starting a match's server. Two ways, one shape: start(match) and target(id) (where its WebSocket listens).
//   local: in this process, on a free port (development, tests, a single machine without Kubernetes)
//   k8s:   a Kubernetes Job (one pod) and a Service named match-<id>, in the api's own namespace; the Service is owned by the Job, so
//          when Kubernetes removes the finished Job (ttlSecondsAfterFinished) the Service goes with it
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { createMatch } from './match.js';
import { MATCH } from '../js/online.js';

// match: { id, startsAt, config: { seed, houses, diff, people, fog }, seats: [{ seat, user, name }] }
export function localLauncher({ secret, report, log = console.log, ...opts }) {
  const running = new Map();
  return {
    kind: 'local',
    async start(m) {
      const h = await createMatch({ id: m.id, config: m.config, seats: m.seats, secret, port: 0, startAt: m.startsAt, report, log, ...opts });
      running.set(m.id, h); h.done.then(() => { setTimeout(() => { h.close(); running.delete(m.id); }, 1000); });
      return { where: `127.0.0.1:${h.port}` };
    },
    target(id) { const h = running.get(id); return h ? { host: '127.0.0.1', port: h.port } : null; },
    stopAll() { for (const h of running.values()) h.close(); running.clear(); },
  };
}

// The Job and Service for one match (pure: tested on its own).
export function matchManifests(m, { image, apiUrl, secretName = 'auld-secrets', namespace, capS = MATCH.capS, graceS = MATCH.graceS }) {
  const name = `match-${m.id}`, labels = { app: 'auld-match', match: m.id };
  const config = JSON.stringify({ ...m.config, seats: m.seats });
  const job = {
    apiVersion: 'batch/v1', kind: 'Job',
    metadata: { name, namespace, labels },
    spec: {
      backoffLimit: 0,                                   // a match that crashes is not restarted: its players would be on a fresh, different match
      ttlSecondsAfterFinished: 600,
      activeDeadlineSeconds: Math.ceil(capS + graceS + 1800),
      template: {
        metadata: { labels },
        spec: {
          restartPolicy: 'Never', automountServiceAccountToken: false, enableServiceLinks: false,
          securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, seccompProfile: { type: 'RuntimeDefault' } },
          containers: [{
            name: 'match', image, imagePullPolicy: 'IfNotPresent',
            command: ['node', '--disable-warning=ExperimentalWarning', 'server/match.js'],
            env: [
              { name: 'MATCH_ID', value: m.id }, { name: 'MATCH_CONFIG', value: config }, { name: 'MATCH_START_AT', value: String(m.startsAt) },
              { name: 'API_URL', value: apiUrl }, { name: 'PORT', value: '8080' },
              { name: 'MATCH_SECRET', valueFrom: { secretKeyRef: { name: secretName, key: 'match-secret' } } },
            ],
            ports: [{ containerPort: 8080, name: 'ws' }],
            resources: { requests: { cpu: '100m', memory: '160Mi' }, limits: { cpu: '1', memory: '512Mi' } },
            readinessProbe: { httpGet: { path: '/healthz', port: 8080 }, periodSeconds: 5 },
            securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } },
          }],
        },
      },
    },
  };
  const service = { apiVersion: 'v1', kind: 'Service', metadata: { name, namespace, labels }, spec: { selector: labels, ports: [{ name: 'ws', port: 8080, targetPort: 8080 }] } };
  return { job, service };
}

// A small Kubernetes API client: in the cluster it reads the pod's service account token and CA; tests pass `request` instead.
function k8sRequest({ base = 'https://kubernetes.default.svc', tokenFile = '/var/run/secrets/kubernetes.io/serviceaccount/token', caFile = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt' } = {}) {
  return (method, path, body) => new Promise((resolve, reject) => {
    const token = readFileSync(tokenFile, 'utf8').trim(), u = new URL(path, base), data = body ? JSON.stringify(body) : null;
    const req = https.request(u, { method, ca: readFileSync(caFile), headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) }, timeout: 15000 }, (res) => {
      let s = ''; res.on('data', (c) => { s += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch {} resolve({ status: res.statusCode, body: j }); });
    });
    req.on('timeout', () => req.destroy(new Error('the Kubernetes API did not answer'))); req.on('error', reject);
    if (data) req.write(data); req.end();
  });
}

export function k8sLauncher({ namespace, image, apiUrl, secretName, request = k8sRequest(), log = console.log }) {
  if (!namespace || !image || !apiUrl) throw new Error('k8s launcher needs namespace, image and apiUrl');
  return {
    kind: 'k8s',
    async start(m) {
      const { job, service } = matchManifests(m, { image, apiUrl, secretName, namespace });
      const j = await request('POST', `/apis/batch/v1/namespaces/${namespace}/jobs`, job);
      if (j.status === 409) log(`[launch] ${job.metadata.name} already exists`);
      else if (j.status >= 300) throw new Error(`creating the Job failed (${j.status}: ${j.body?.message || ''})`);
      const uid = j.body?.metadata?.uid;
      if (uid) service.metadata.ownerReferences = [{ apiVersion: 'batch/v1', kind: 'Job', name: job.metadata.name, uid, blockOwnerDeletion: false }];
      const s = await request('POST', `/api/v1/namespaces/${namespace}/services`, service);
      if (s.status >= 300 && s.status !== 409) throw new Error(`creating the Service failed (${s.status}: ${s.body?.message || ''})`);
      return { where: `${job.metadata.name}.${namespace}.svc.cluster.local:8080` };
    },
    target(id) { return /^[a-z0-9]{8}$/.test(id) ? { host: `match-${id}.${namespace}.svc.cluster.local`, port: 8080 } : null; },
    stopAll() {},
  };
}
