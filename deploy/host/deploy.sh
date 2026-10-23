#!/bin/sh
# Deploy one release of Auld World on this server. GitHub Actions runs it through AWS Systems Manager (no SSH, no open Kubernetes port).
#   deploy.sh <production|staging|edge> <release>      e.g. deploy.sh staging 1.0.57
# The release's manifests were rendered by CI and uploaded to s3://<bucket>/releases/<release>/<target>.yaml. The secrets come from SSM
# Parameter Store under /auld/<env>/ (session-secret, match-secret, and optionally google-client-id ... discord-webhook-url), never from git.
# Installed by the server's first boot (deploy/terraform/user_data.sh.tftpl) at /opt/auld/deploy.sh, with /etc/auld/{bucket,region}.
set -eu
TARGET=${1:?production, staging or edge}; RELEASE=${2:?release}
case "$TARGET" in production) NS=auld ;; staging) NS=auld-staging ;; edge) NS=edge ;; *) echo "unknown target $TARGET"; exit 2 ;; esac
case "$RELEASE" in *[!A-Za-z0-9._-]*|"") echo "bad release name"; exit 2 ;; esac
BUCKET=$(cat /etc/auld/bucket); REGION=$(cat /etc/auld/region)
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml AWS_REGION="$REGION"
K=/usr/local/bin/kubectl
log() { echo "[deploy $TARGET $RELEASE] $*"; }

# Production waits out the minutes round the hour, when the api launches the match (a restart takes seconds, but there is no need to race it).
if [ "$TARGET" = production ]; then
  while :; do m=$(date -u +%M); case "$m" in 58|59|00|01) log "waiting: the hourly match is being launched"; sleep 30 ;; *) break ;; esac; done
fi

FILE=$(mktemp); trap 'rm -f "$FILE"' EXIT
aws s3 cp --only-show-errors "s3://$BUCKET/releases/$RELEASE/$TARGET.yaml" "$FILE"
$K create namespace "$NS" --dry-run=client -o yaml | $K apply -f - >/dev/null

if [ "$TARGET" != edge ]; then
  # the secrets: every parameter under /auld/<env>/ becomes a key of the Secret auld-secrets (the Secret is replaced as a whole)
  ARGS=""
  aws ssm get-parameters-by-path --path "/auld/$TARGET/" --with-decryption --query 'Parameters[].[Name,Value]' --output text > "$FILE.p"
  while IFS="$(printf '\t')" read -r name value; do
    key=${name##*/}; case "$key" in *[!a-z0-9-]*|"") continue ;; esac
    printf '%s' "$value" > "$FILE.$key"; ARGS="$ARGS --from-file=$key=$FILE.$key"
  done < "$FILE.p"
  case "$ARGS" in *session-secret*) ;; *) log "missing /auld/$TARGET/session-secret in SSM"; exit 1 ;; esac
  case "$ARGS" in *match-secret*) ;; *) log "missing /auld/$TARGET/match-secret in SSM"; exit 1 ;; esac
  # shellcheck disable=SC2086
  $K -n "$NS" create secret generic auld-secrets $ARGS --dry-run=client -o yaml | $K apply -f - >/dev/null
  rm -f "$FILE".p "$FILE".*-*
  # a private image: pull with the token in /auld/ghcr-pull-token, if there is one (a public package needs none)
  if TOKEN=$(aws ssm get-parameter --name /auld/ghcr-pull-token --with-decryption --query Parameter.Value --output text 2>/dev/null); then
    $K -n "$NS" create secret docker-registry ghcr --docker-server=ghcr.io --docker-username=auld --docker-password="$TOKEN" --dry-run=client -o yaml | $K apply -f - >/dev/null
    for sa in default auld-api; do $K -n "$NS" get sa "$sa" >/dev/null 2>&1 && $K -n "$NS" patch sa "$sa" -p '{"imagePullSecrets":[{"name":"ghcr"}]}' >/dev/null; done
  fi
fi

$K apply -f "$FILE"
if [ "$TARGET" = edge ]; then $K -n edge rollout status deploy/caddy --timeout=180s; else $K -n "$NS" rollout status deploy/api --timeout=300s; fi
log "done"
