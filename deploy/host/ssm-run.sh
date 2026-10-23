#!/bin/sh
# Run one command on the server through AWS Systems Manager and wait for it (GitHub Actions; needs the AWS CLI, jq and credentials).
#   deploy/host/ssm-run.sh <instance id> <command ...>      e.g. ssm-run.sh i-0123 /opt/auld/deploy.sh staging 1.0.57
# Prints the command's output; exits 0 only if it succeeded.
set -eu
ID=${1:?instance id}; shift
CMD="$*"
PARAMS=$(jq -cn --arg c "$CMD" '{commands: [$c], executionTimeout: ["1200"]}')
CID=$(aws ssm send-command --instance-ids "$ID" --document-name AWS-RunShellScript --comment "auld: $CMD" --timeout-seconds 600 --parameters "$PARAMS" --query Command.CommandId --output text)
echo "[ssm] $CMD (command $CID)"
STATUS=Pending
i=0
while [ $i -lt 240 ]; do
  sleep 5; i=$((i + 1))
  STATUS=$(aws ssm get-command-invocation --command-id "$CID" --instance-id "$ID" --query Status --output text 2>/dev/null || echo Pending)
  case "$STATUS" in Success|Failed|Cancelled|TimedOut) break ;; esac
done
aws ssm get-command-invocation --command-id "$CID" --instance-id "$ID" --query StandardOutputContent --output text || true
aws ssm get-command-invocation --command-id "$CID" --instance-id "$ID" --query StandardErrorContent --output text >&2 || true
echo "[ssm] $STATUS"
[ "$STATUS" = Success ]
