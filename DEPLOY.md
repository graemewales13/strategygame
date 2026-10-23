# Deploying Auld World online

How the hourly online game is hosted, set up and run. The design and its reasons are in [ONLINE.md](ONLINE.md). Everything here lives on the `network` branch.

## What runs where

| Piece | Where | What it does |
|---|---|---|
| **Server** | One AWS t4g.small (2 vCPU, 2 GB), Amazon Linux 2023, **k3s** (Kubernetes) | Runs everything below |
| **Front door** | Caddy, namespace `edge` | HTTPS for `<domain>` and `staging.<domain>` (free certificates from Let's Encrypt). Sends `/m/<id>/ws` to that match, everything else to the api |
| **api** | One pod per environment, namespaces `auld` and `auld-staging` | The game's files, sign-in, the timetable, tickets, results, league |
| **Database** | SQLite on the server's disk | Litestream copies every change to S3 within seconds; a new server restores it before the api starts |
| **Matches** | One Kubernetes Job per match, `match-<id>` | Started by the api on the hour; ends and is removed by itself |
| **Images** | `ghcr.io/graemewales13/auld-world:<version>` | Built for arm64 and amd64 by GitHub Actions |
| **Secrets** | AWS SSM Parameter Store, `/auld/<env>/...` | Read by the server at each deploy. Never in git |
| **Deploys** | GitHub Actions to AWS (OIDC: no stored keys) to Systems Manager to `/opt/auld/deploy.sh` on the server | No SSH, no open Kubernetes port |

Cost: about $20 a month (about £15). The breakdown is in ONLINE.md section 8. Terraform also makes a monthly **budget alarm** that emails you at 80% of $25 spent, and when the month's forecast passes $25.

## One-time setup

### 1. Tools on your PC

| Tool | How to get it |
|---|---|
| An AWS account, and a user who may create resources | You sign in with this user in step 2 |
| The AWS CLI v2 | `winget install Amazon.AWSCLI` |
| Terraform 1.10 or later | `winget install Hashicorp.Terraform` |
| *Optional:* the Session Manager plugin, for a shell on the server | `winget install Amazon.SessionManagerPlugin` |

### 2. Sign in to AWS

```powershell
aws configure          # or: aws configure sso
aws sts get-caller-identity   # shows the account: check it is the right one
```

### 3. The bucket for Terraform's own state (once)

```powershell
cd deploy\terraform\bootstrap
terraform init
terraform apply        # type yes; note the output state_bucket
```
Keep `deploy\terraform\bootstrap\terraform.tfstate`. Git ignores it.

### 4. The server and everything around it

Create `deploy\terraform\terraform.tfvars`. It is ignored by git.
```hcl
alert_email = "you@example.com"   # budget alerts, Let's Encrypt notices
# domain          = "play.example.com"   # later: see "Adding a domain"
# route53_zone_id = "Z0123..."
```
Then:
```powershell
cd deploy\terraform
terraform init -backend-config="bucket=<state_bucket from step 3>"
terraform plan         # read it: nothing is made yet
terraform apply        # type yes; takes about 3 minutes
terraform output github_variables
```
The server installs k3s by itself on first boot, which takes about 3 more minutes. Its log is `/var/log/auld-setup.log`.

The exact provider versions (AWS 6.70.0, random 3.9.1) are pinned in `.terraform.lock.hcl`, which is committed, with checksums for Windows, Mac and Linux.

### 5. GitHub

1. **Repository variables:** Settings, Secrets and variables, Actions, **Variables**. Add each entry of `github_variables` with the same name and value: `AWS_REGION`, `AWS_DEPLOY_ROLE`, `AULD_BUCKET`, `AULD_INSTANCE_ID`, `AULD_PROD_HOST`, `AULD_STAGE_HOST`, `AULD_MAIL_FROM` (empty until you have a domain) and `AULD_ACME_EMAIL`.
2. **Environments:** Settings, Environments.
   - `staging`, with no protection.
   - `production`, with **Required reviewers: you**. Every production deploy then waits for your approval.
3. **The first release:** push to `network`, or run Actions, Release, Run workflow. CI then:
   - tests everything
   - builds the image and publishes release `v1.0.<n>`
   - deploys the front door and staging
   - plays a whole match on staging
4. **Make the image public, once:** github.com/graemewales13, Packages, **auld-world**, Package settings, Change visibility, **Public**. The repository is public, so this exposes nothing new.
   - If you would rather keep the image private, store a GitHub token that can read packages as `/auld/ghcr-pull-token` (as in "Secrets" below). The server then pulls with it.
5. **Open staging:** `https://staging.<address>.sslip.io`, or `staging.<domain>` once you have one. Staging has the **test sign-in** (type any name) and a match every 5 minutes, each 5 minutes long.

### 6. Production

Promote a release by pushing a tag named `production-<version>`, then approve the run in Actions:
```powershell
git fetch --tags; git tag production-1.0.3 v1.0.3; git push origin production-1.0.3
```
 It deploys that release, checks the site answers with that version, and records it as production's release. If the check fails, it puts the previous release back.
(The "Run workflow" button for **Deploy to production** appears only once the workflow file is also on the repository's default branch, `main`. GitHub runs button and follow-on workflows only from the default branch. Tags work from any branch.)

## Adding a domain (and with it, email codes and Google sign-in)

1. **Buy a domain.** Route 53, Registered domains, is simplest: the zone is made for you.
2. **Tell Terraform.** Set `domain` (and `route53_zone_id` if the zone is in Route 53) in `terraform.tfvars`, then run `terraform apply`. It makes:
   - the A records for the domain and `staging.<domain>`
   - the SES email identity and its DKIM records

   If your DNS is elsewhere, add the records yourself: `terraform output public_ip` and `terraform output email_dns_records`.
3. **Update GitHub.** Set the repository variables `AULD_PROD_HOST`, `AULD_STAGE_HOST` and `AULD_MAIL_FROM` from `terraform output github_variables`.
4. **Let SES send to anyone.** SES starts in a sandbox that only sends to verified addresses. In the SES console, open Account dashboard, **Request production access**: say it sends one-time sign-in codes to players who ask for them. AWS usually answers within a day.
5. **Release again**, then deploy to production. Caddy fetches the new certificates by itself.

## Sign-in with Google, Discord and GitHub

Each needs an "OAuth app" made on its own site, and two values stored in SSM.

| Provider | Where to make the app | Callback URL to give it |
|---|---|---|
| Google | console.cloud.google.com, APIs & Services, Credentials, OAuth client ID (Web). Needs the domain | `https://<domain>/api/auth/google/callback` |
| Discord | discord.com/developers/applications, OAuth2 | `https://<domain>/api/auth/discord/callback` |
| GitHub | github.com/settings/developers, OAuth Apps | `https://<domain>/api/auth/github/callback` |

Staging needs its own apps, or an extra callback URL on staging's host.

Store the values. Repeat for each provider and environment:
```powershell
aws ssm put-parameter --name /auld/production/google-client-id     --type SecureString --value "<client id>"
aws ssm put-parameter --name /auld/production/google-client-secret --type SecureString --value "<client secret>"
# discord-client-id, discord-client-secret, github-client-id, github-client-secret
# and optionally discord-webhook-url (each match's result posted to a Discord channel)
```
Then deploy the same release again with a new tag name: `git tag production-1.0.3-again v1.0.3; git push origin production-1.0.3-again` (anything after the version is ignored). The button appears on the online screen once both values are there.

## Day to day

| Task | How |
|---|---|
| **Release** | Merge or push to `network`. CI tests, then Release builds, publishes and deploys to staging, and plays a match there |
| **Production** | Push the tag `production-<version>`, approve the run. It waits out minutes :58 to :01 of each hour, while the match is launched |
| **Roll back** | Push a tag for the earlier version: `git tag production-1.0.2-back v1.0.2; git push origin production-1.0.2-back`. Every release's manifests stay in S3 for 180 days |
| **Look at the server** | `terraform output shell` gives the command. Then, on the server: `sudo kubectl -n auld get pods`, `sudo kubectl -n auld logs deploy/api -c api`, `sudo kubectl -n auld get jobs` (the matches) |
| **A match's log** | `sudo kubectl -n auld logs job/match-<id>`. Jobs are removed 10 minutes after they end |
| **Backups** | Continuous: Litestream, to `s3://<bucket>/db/<env>/`, with 7 days of history. A new server restores by itself. To practise a restore, replace the server (`terraform apply -replace=aws_instance.server`), release, and check the league is still there |
| **Change a secret** | `aws ssm put-parameter --name ... --overwrite`, then deploy again. Changing `match-secret` ends any match in progress for its players, so do it between matches |
| **Costs** | AWS Billing. The budget alarm emails you |
| **Remove everything** | `terraform destroy` in `deploy\terraform`. The data bucket must be emptied first. The state bucket stays (`prevent_destroy`) |

## Running it on your own PC

Node 22 or later (`winget install OpenJS.NodeJS.LTS`), on the `network` branch:
```powershell
$env:AUTH_DEV = '1'; $env:EVERY_MIN = '5'; node server/api.js
```
Open http://localhost:8080. For a second player, use another browser or a private window. Everything is kept in memory, and a match runs every 5 minutes.

With Docker instead:
```powershell
docker build -t auld-world .
docker run -p 8080:8080 -e AUTH_DEV=1 -e NODE_ENV=staging -e EVERY_MIN=5 auld-world
```

## When something is wrong

| Symptom | Look at |
|---|---|
| The site does not answer | `sudo kubectl -n edge logs deploy/caddy`. A certificate cannot be issued until the domain points at the server |
| "Something went wrong" in the online screen | `sudo kubectl -n auld logs deploy/api -c api` |
| No match at the hour | The api log, lines starting `[schedule]`. Jobs: `sudo kubectl -n auld get jobs` |
| Players cannot reach a match | The match's log; `sudo kubectl -n auld get svc`. Caddy sends `/m/<id>/ws` to `match-<id>` |
| The league did not update | The match log ends with "result reported" or a retry. The api log has `[results]` |
| A deploy failed | The workflow's log shows the server's own output (deploy.sh) |

TROUBLESHOOTING.md T-090 to T-093 tell how each part was built and tested.
