<#
  Auld World on your own PC, the way it runs on AWS: the same image, the same Kubernetes manifests, the same Caddy front door, in a k3s
  cluster inside Docker. Only Docker Desktop is needed (Node runs in a container). Database copies go to a folder on the cluster's disk
  instead of S3. It is the staging set-up: the test sign-in is on.

    .\deploy\local\local.ps1 up        build the image, start the cluster, deploy; then open http://localhost:8480
    .\deploy\local\local.ps1 check     play a whole match through it automatically (two test players, about 10 minutes)
    .\deploy\local\local.ps1 status    what is running: the api, Caddy, the matches
    .\deploy\local\local.ps1 logs      the api's log
    .\deploy\local\local.ps1 down      remove the cluster (the image stays; 'docker rmi auld-world:local' removes it)

  Options for up: -Port 8480 (where the game answers), -EveryMin 5 (a match every 5 minutes), -CapS 300 (5-minute matches).
  Needs about 1.5 GB of Docker's memory and a few minutes the first time.
#>
param(
  [ValidateSet('up', 'check', 'status', 'logs', 'down')] [string] $Action = 'up',
  [int] $Port = 8480,
  [int] $EveryMin = 5,
  [int] $CapS = 300
)
# 'Continue': in Windows PowerShell 5 a native program writing to stderr (docker's progress) would otherwise stop the script; every step's
# exit code is checked instead (Run), and real problems throw.
$ErrorActionPreference = 'Continue'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Name = 'auld-local'; $Image = 'auld-world:local'
$K3s = 'rancher/k3s:v1.33.4-k3s1'; $Node = 'node:22.20.0-alpine3.22'
$Out = Join-Path $PSScriptRoot '.out'

function Say($t) { Write-Host "[local] $t" -ForegroundColor Yellow }
function Run([string] $what, [scriptblock] $cmd) {   # run a command; stop with its message if it fails
  & $cmd
  if ($LASTEXITCODE -ne 0) { throw "$what failed (exit $LASTEXITCODE)" }
}
function Kube { docker exec $Name kubectl @args }
function Exists { [bool](docker ps -a --filter "name=^$Name$" --format '{{.Names}}') }

switch ($Action) {
  'up' {
    docker info --format '{{.ServerVersion}}' *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Docker is not running: start Docker Desktop first.' }

    Say "building the image ($Image)"
    Run 'docker build' { docker build --build-arg VERSION=local -t $Image $Repo }

    if (Exists) { Say "removing the old cluster"; docker rm -f $Name *> $null }
    Say "starting k3s ($K3s) on port $Port"
    Run 'starting k3s' { docker run -d --name $Name --privileged -p "${Port}:80" $K3s server --disable traefik --disable servicelb --disable metrics-server | Out-Null }
    $ready = $false
    for ($i = 0; $i -lt 60 -and -not $ready; $i++) { Start-Sleep 3; $ready = [bool]((docker exec $Name kubectl get nodes 2>$null) -match ' Ready') }
    if (-not $ready) { throw 'k3s did not become ready' }

    Say 'loading the image into the cluster (a few minutes)'
    New-Item -ItemType Directory -Force $Out | Out-Null
    $tar = Join-Path $Out 'image.tar'
    Run 'docker save' { docker save -o $tar $Image }   # (a file, not a pipe: PowerShell 5 pipes damage binary data)
    Run 'copying the image' { docker cp $tar "${Name}:/tmp/image.tar" }
    Run 'importing the image' { docker exec $Name ctr -n k8s.io images import /tmp/image.tar | Out-Null }
    Remove-Item $tar; docker exec $Name rm -f /tmp/image.tar

    Say 'rendering the manifests (the same templates as AWS)'
    # written by the container itself: PowerShell 5's > would write UTF-16, which kubectl cannot read
    Run 'render' { docker run --rm -v "${Repo}:/r" -w /r $Node sh -c "mkdir -p deploy/local/.out && node deploy/k8s/render.mjs app --env staging --image $Image --version local --host http://localhost:$Port --bucket file --every-min $EveryMin --cap-s $CapS > deploy/local/.out/app.yaml && node deploy/k8s/render.mjs edge --prod-site http://prod.localhost --staging-site http://localhost --acme-email nobody@example.com > deploy/local/.out/edge.yaml" }
    Run 'copying the manifests' { docker cp (Join-Path $Out 'app.yaml') "${Name}:/tmp/app.yaml" }
    Run 'copying the manifests' { docker cp (Join-Path $Out 'edge.yaml') "${Name}:/tmp/edge.yaml" }

    Say 'deploying the front door and the game'
    Run 'kubectl apply edge' { Kube apply -f /tmp/edge.yaml }
    Run 'kubectl apply app' { Kube apply -f /tmp/app.yaml }
    $s1 = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'); $s2 = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
    Run 'the secrets' { Kube -n auld-staging create secret generic auld-secrets "--from-literal=session-secret=$s1" "--from-literal=match-secret=$s2" | Out-Null }
    Run 'waiting for the api' { Kube -n auld-staging rollout status deploy/api --timeout=300s }
    Run 'waiting for Caddy' { Kube -n edge rollout status deploy/caddy --timeout=180s }

    $ok = $false
    for ($i = 0; $i -lt 30 -and -not $ok; $i++) { try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://localhost:$Port/healthz"; $ok = $r.Content -like 'ok*' } catch { Start-Sleep 2 } }
    if (-not $ok) { throw "the game did not answer at http://localhost:$Port/healthz" }
    Say "ready: open http://localhost:$Port and press 'Play online'. Use the test sign-in (any name); a second player needs another browser or a private window."
    Say "a match starts every $EveryMin minutes and lasts $([math]::Round($CapS / 60, 1)) minutes. '.\deploy\local\local.ps1 check' plays one automatically."
  }
  'check' {
    if (-not (Exists)) { throw "nothing is running: '.\deploy\local\local.ps1 up' first" }
    Say 'playing a whole match through the cluster (two test players; waits for the next match to start)'
    # from inside the cluster's own network, as a browser would reach it; the site's origin is the address on your PC
    Run 'the check' { docker run --rm --network "container:$Name" -v "${Repo}:/r" -w /r $Node node tools/cluster-check.mjs http://localhost:80 --origin "http://localhost:$Port" --expect-version local }
  }
  'status' {
    if (-not (Exists)) { Say 'nothing is running'; break }
    Kube get pods,jobs,svc -n auld-staging; Kube get pods -n edge
  }
  'logs' { Kube -n auld-staging logs deploy/api -c api --tail=100 }
  'down' {
    if (Exists) { docker rm -f $Name | Out-Null; Say 'cluster removed' } else { Say 'nothing to remove' }
    if (Test-Path $Out) { Remove-Item -Recurse -Force $Out }
  }
}
