# Auld World online: design and plan

Status: **design, for the owner's review** (2026-10-22). Nothing here is live yet. Decisions already taken by the owner are marked **(decided)**.

## 1. What we are building

| Feature | Summary |
|---|---|
| Accounts | Sign in with **email code, Google, Discord or GitHub** (decided). Choose a username on first sign-in. |
| Hourly matches | **One match starts every hour, on the hour.** Up to **8 players** sign up for the next one; the AI plays every seat nobody takes. If only one player signs up, 7 AI houses play. If nobody signs up, no match runs. |
| Match end | **Conquest wins outright. At 2 hours the standings decide** (decided). |
| Points and league | Each player gets points from their place. A league table (this month and all time) shows on the online menu, on a plain web page at `/league`, and optionally in a Discord channel. |
| Messages | **Preset messages only**, such as "Join me in defeating {house}". There is no free text, so nothing needs moderating. |
| Hosting | **AWS, one t4g.small server running k3s** (decided). k3s is real Kubernetes, small enough for one machine. Each match runs in its own container (a Kubernetes Job). |
| Delivery | GitHub Actions does CI/CD: tests, versioned builds, image artefact, deploy to staging, then a promotion to production. Terraform builds the infrastructure. |
| Budget | About **£15 a month**, inside the £20 limit (section 8). |

## 2. Blocker found while designing: the simulation is too slow for 8 houses

Every player's browser runs the whole simulation in lockstep, and so does the server's referee (section 4). I measured 8 AI houses on the standard 320-tile board, headless in Node on the development PC:

| Simulated minute | 1 | 3 | 5 | 7 | 9 | 10 |
|---|---|---|---|---|---|---|
| Seconds of computing for that minute | 4.2 | 5.8 | 10.3 | 18.8 | 28.7 | 35.1 |

Single ticks stalled for up to 0.7 s. The cost grows faster than the number of units (91 units to 496), which points at code that compares every unit with every other unit. A 2-hour 8-house match would fall behind real time on ordinary machines long before the cap. Single-player games with 8 houses (the menu's default) have the same problem.

The profile puts the time in:
- unit updates, 30%: gathering, attacking, idle search, separation
- villages, 14%
- AI thinking, 13%
- vision, 8%
- pathfinding, 7%

**Plan:** a performance pass on the game (this is ROADMAP T18), done on `grok` because it is game work, then merged into `network`.
- **The fix:** a spatial grid for "closest enemy", "nearest resource" and separation; staggered village and AI updates; incremental vision; cached paths.
- **The targets:**
  - an 8-house match on the standard board stays under 25% of one core at minute 60
  - no single tick takes over 50 ms
  - a test in CI enforces both

Until that is done, online matches cannot safely run 8 houses.

**Update 2026-10-23: done** (on `grok`, merged here; TROUBLESHOOTING T-088 and T-089). Measured on the development PC, a 4-core Intel N95, which is roughly half the speed of a typical laptop core:
- **Minute 30:** 50 s of computing per simulated minute before, about 25 s now.
- **Longest ticks:** 0.6 s before, about 0.2 s now.
- **On a typical laptop:** a long 8-house match should need roughly a fifth to a quarter of one core.

How it was done:
- **Part 1 changed nothing in play.** A whole-state fingerprint is unchanged.
- **Part 2 updates a few things less often.** Over 12 seeds, play ended within chance of before.
- **Kept from creeping back:** CI counts the work done in a fixed 8-house match and fails past a budget.

Still open: a Web Worker to keep drawing smooth during a slow tick. Part 2 also means the server's referee costs about half what it did.

## 3. How a match runs

```
 browser ──https──► Caddy (TLS) ──► api  (accounts, schedule, league, game files)  ◄── SQLite on disk, copied to S3
    │                                │ creates at HH:00
    └──wss /m/<id>/ws──► Caddy ──► match-<id>  (one container per match: relay + referee)
```

1. **Sign-up.** From 30 minutes before the hour, signed-in players press **Join the 14:00 match**. The first 8 get seats. A player can leave before the start.
2. **Launch (HH:00).** The api creates the match: seed, 8 houses, seats, people.
   - It asks Kubernetes for a Job, `match-<id>`, and a Service to go with it.
   - Each signed-up player's page receives a **match ticket**: a short-lived token signed with a secret that the api and the match share. It names the match, the player and their seat.
3. **Joining.** The page connects to `wss://<domain>/m/<id>/ws` with its ticket.
   - The match accepts only valid tickets and takes the seat from the ticket, never from the player.
   - The match waits up to 2 minutes for everyone, then starts. A seat whose player has not arrived starts as AI and is handed back if they arrive later. This uses the existing "away" mechanism.
4. **Playing.** Lockstep, as the relay already does it:
   - Orders go to the match, which stamps them with the sender's seat and sends them out in 100 ms turns.
   - Every browser runs the same deterministic simulation.
5. **The referee.** The match container runs its own headless copy of the game on the same turns. It is the authority:
   - **Results come from the referee**, so a player cannot claim a win they did not earn. This matters most when one human plays 7 AI houses, because then there is nobody to compare against.
   - **Desyncs are mended, not just reported.** When a browser's state fingerprint differs from the referee's, the match sends that browser the referee's saved state. The browser loads it (`Game.restore`) and carries on. This also covers browsers whose maths differs slightly (section 9).
6. **The end.** Conquest, or the 2-hour cap.
   - The referee ranks the houses (section 5) and sends the result to the api over the cluster's internal network, signed with the shared secret.
   - Every player sees the final standings, and the container exits.
   - Kubernetes removes the Job a few minutes later; the Service goes with it.
7. **A dropped player** reloads the page and rejoins their seat with their ticket. While they are gone, the AI holds their house, as the relay already does.

**Preset messages.** These are message numbers, not text.
- A player picks a message from a fixed list, a target house when the message names one, and the recipients: everyone, or one player.
- The match checks the number against the list and the house against the board, limits each player to one message every 2 s, and passes it on.
- Each browser shows the text from its own copy of the list, so no free text ever crosses the network. Players can mute anyone.

Proposed list (easy to change):
- Join me in defeating {house}
- Will you make peace?
- Let us trade
- Beware {house}
- {house} is attacking me, help!
- Attack {house} now
- I will hold the line
- Thank you
- No
- Well played
- Good game

## 4. The services

| Part | What it is |
|---|---|
| **api** (`server/api.js`) | Node 22 with no npm packages except the AWS SDK for sending email.<br>Serves the game files and the JSON API (`/api/...`), and handles sign-in, usernames, sessions, sign-ups, the hourly scheduler, launching matches, results and the league.<br>One copy (SQLite has one writer). It restarts in seconds; live matches are not affected because they run in their own containers. |
| **match** (`server/match.js`) | The current `relay.js` grown up: tickets instead of open rooms, 8 seats, the referee, preset messages, the result. |
| **Image** | One image, `ghcr.io/graemewales13/auld-world:<version>`, built for arm64 (t4g) and amd64.<br>The api and the match are two commands in it. |
| **Caddy** | The front door: free automatic HTTPS from Let's Encrypt.<br>`/m/<id>/ws` goes to `match-<id>`; the id must be 8 lowercase letters or digits, so nothing else in the cluster can be reached. Everything else goes to the api. |
| **SQLite** | One file on the server's disk. **Litestream** copies every change to S3 within seconds, so a lost server loses almost nothing. |
| **Scheduler** | Inside the api: every 15 s it checks whether a match is due.<br>After a restart it still launches a match that is less than 5 minutes late, and marks one that is later than that as missed. This is simpler and safer than a CronJob calling in. |

**Data** (SQLite tables):

| Table | Fields |
|---|---|
| `users` | id, username (unique, case-insensitive), email, created |
| `identities` | provider + provider's user id → user (Google, Discord, GitHub, email) |
| `sessions` | hashed id, user, expiry |
| `email_codes` | hashed code, expiry, attempts |
| `matches` | id, start time, status, seed, config, result |
| `match_players` | match, user, seat, place, points |

## 5. Points and the league

**Places.**
- The conqueror is 1st.
- If the cap ends the match, houses still standing are ranked by the game's own rank score (wealth, villages, folk, power, learning, arms; the Council's "Rank").
- Fallen houses come after them, the last to fall placed highest.

**Points per human player** (one table in the config, easy to tune):

| Place | 1st | 2nd | 3rd | 4th | 5th | 6th | 7th | 8th |
|---|---|---|---|---|---|---|---|---|
| Points | 100 | 70 | 50 | 35 | 25 | 15 | 10 | 5 |

- **+15** for every other human player who finished below you, so beating people counts for more than beating the AI.
- **+50** for winning by conquest.
- **No-shows** (signed up, never connected) score 0 and are listed as such.

**League.**
- **This month:** points summed per player, ties broken by wins, then by points per match. A new season starts every month.
- **All time:** the same, never reset.
- **Where it shows:** the online menu (top 10 and your own row), `/league`, and a Discord webhook (optional) that posts each match's result.

## 6. Sign-in and safety

**Email code.**
- A 6-digit code, valid for 10 minutes, with 5 tries. Only its hash is stored.
- Limits: 3 codes per address per 15 minutes, 10 per IP address per hour.
- The page never says whether an address has an account.

**Google, Discord, GitHub.**
- Standard OAuth sign-in (authorization code with PKCE), with the state checked.
- Accounts are keyed by the provider's own user id. A provider's email joins an existing account only when the provider says it is verified.

**Usernames.**
- 3 to 16 letters, digits, `_` or `-`; unique regardless of capitals.
- A blocklist of offensive and reserved words (admin, mod, system and so on).
- A Report button on a username flags it for the owner to rename.

**Sessions.**
- A random id in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie, valid for 30 days. Only its hash is stored.
- Requests that change anything must send a custom header and come from our own origin. That blocks cross-site forgery.

**Other protections.**
- Security headers: a content security policy, `frame-ancestors 'none'`, HSTS.
- Every order and message is rate-limited, as the relay already does.

**Legal.**
- A short privacy notice (we keep an email address and a username) and terms with a minimum age of 13.
- **Delete my account** removes the email and replaces the username with "Fallen house #n" in the league.
- With preset messages only, the main user-to-user risk under the UK Online Safety Act is usernames; the blocklist and the Report button cover it.

**A dev sign-in** ("sign in as test user") exists for local runs and staging only. The api refuses to start with it switched on in production.

## 7. Delivery: environments, CI/CD, Terraform

**Environments.** One server, two namespaces:
- **`auld`** is production.
- **`auld-staging`** is staging, on `staging.<domain>`. Its matches don't start on a timetable; you start them by hand.

**Until there is a domain:**
- Terraform names the server with its address on sslip.io (for example `18-130-1-2.sslip.io`), which still gets a real HTTPS certificate. Staging uses `staging.18-130-1-2.sslip.io`.
- What works: Discord and GitHub sign-in, and the dev sign-in on staging.
- What waits for the domain: email codes (they need a verified sending domain) and Google sign-in (Google requires a domain you own).

**Versions.**
- `VERSION` holds major.minor; the patch number is the CI run number, for example `1.0.57`.
- Every release gets:
  - a git tag `v1.0.57`
  - an image tag
  - a GitHub Release carrying the Kubernetes manifests and an SBOM (the image's list of contents)
- The game shows the version on the menu.

**Workflows** (`.github/workflows/`):

| Workflow | When | What |
|---|---|---|
| `ci.yml` | every push and pull request | 1. Syntax check, then the game tests (rules, learn, sim, net), then the server tests (sign-in, tickets, scheduler, scoring, league, messages).<br>2. The browser smoke tests, and a two-browser online match through a real match container.<br>3. Docker build.<br>4. A vulnerability scan (Trivy).<br>5. `terraform fmt` and `validate`.<br>6. Kubernetes manifest validation. |
| `release.yml` | a push to `network` once CI passes | 1. Build the arm64 and amd64 image and push it to GitHub's registry.<br>2. Tag and publish the release.<br>3. **Deploy to staging.**<br>4. Smoke-test staging: it is healthy, it reports the new version, and a scripted match starts and finishes. |
| `deploy-production.yml` | by hand ("Run workflow", choose a version) | 1. Deploy that exact image (by digest) to production.<br>2. Smoke-test production.<br>3. If the check fails, roll back to the previous version.<br>4. It never restarts in the 10 minutes before an hourly match. |
| `terraform.yml` | pull requests that touch `deploy/terraform`, and by hand | Shows the plan on the pull request; applies when run by hand. |

**How a deploy reaches the server.** There are no SSH keys and no open Kubernetes port:
1. GitHub signs in to AWS with OIDC: short-lived credentials, no stored AWS keys.
2. The workflow uploads the manifests to S3.
3. It asks AWS Systems Manager to run `deploy.sh <env> <version>` on the server, which applies them with `kubectl`.

**Terraform** (`deploy/terraform/`, AWS provider, state in S3):

| Area | What it creates |
|---|---|
| Server | t4g.small with Amazon Linux 2023 (arm64), a 20 GB encrypted disk and a 2 GB swap file.<br>IMDSv2 only, hop limit 2, so containers can use the server's AWS role.<br>k3s (pinned version) installed at first boot, with its spare parts switched off (Traefik, servicelb, metrics-server) to save memory. |
| Network | An Elastic IP, and a security group open on ports 80 and 443 only. |
| Permissions | **An instance role:** Session Manager, S3 (backups and releases), sending email, reading `/auld/*` secrets.<br>**The GitHub OIDC provider and a deploy role**, limited to this repository and its staging and production environments. |
| Storage and secrets | **An S3 bucket:** private, encrypted, versioned; backups kept 30 days.<br>**Secrets in SSM Parameter Store** (free): the match secret is generated, and OAuth client secrets are entered once with the AWS CLI. They are never in git. |
| When the domain exists | Email sending (SES) for the domain, with its DKIM records, and Route 53 records for the domain and staging. |
| Cost guard | **An AWS Budget** that emails you at £15 and £20 forecast. |
| `bootstrap/` | A tiny separate stack that creates the bucket the state lives in, run once. |

## 8. Cost (AWS London, eu-west-2; check against the AWS calculator)

| Item | $ a month |
|---|---|
| t4g.small, on demand, $0.019 an hour | 13.90 |
| 20 GB gp3 disk | 1.90 |
| Public IPv4 address ($0.005 an hour) | 3.65 |
| Route 53 hosted zone (once there is a domain) | 0.50 |
| S3 (backups and releases, well under 1 GB), SES (pennies per thousand emails), data out (100 GB a month free) | < 0.50 |
| GitHub registry and Actions | 0 (free tier) |
| **Total** | **≈ $20 ≈ £15-16** |

- A 1-year Compute Savings Plan, with no upfront payment, takes the server to about $11, so about **£13 a month**.
- A domain is extra, about £8-12 a year.
- If the server's CPU allowance runs low, t4g burst costs about $0.04 per vCPU-hour, but only after the performance pass (section 2) would that be rare.

**Why not managed Kubernetes or ECS:**
- **EKS** charges $73 a month for the cluster alone.
- **GKE and AKS** have free control planes, but nodes plus a cloud load balancer cost £30-50.
- **ECS on the same server** would cost about the same as k3s. It saves about 500 MB of memory but ties the setup to AWS.
- **ECS Fargate** needs a load balancer and public IPs or a NAT gateway: £35-50.

## 9. Risks and how they are handled

| Risk | Handling |
|---|---|
| The simulation is too slow for 8 houses (section 2) | The performance pass comes first. A CI test fails the build if a 60-minute 8-house match goes over budget. |
| Different browsers compute floating-point maths slightly differently (`Math.hypot`, `sin`, `exp` are not exactly specified) | The referee repairs a drifted browser. CI plays an online match between Chromium, Firefox and WebKit and counts the repairs. If needed, the rules switch to exact operations (for example `Math.sqrt(x*x + y*y)` instead of `Math.hypot`). |
| One server is a single point of failure | A reboot ends live matches, but accounts and the league are safe in S3 (Litestream). Terraform rebuilds the server, and the data is restored automatically on first boot. |
| Memory on 2 GB | k3s about 600 MB, api about 80 MB, Caddy about 40 MB, one match about 200 MB; at most two matches overlap (2-hour cap). Swap gives a margin, and Kubernetes limits stop one container from taking the rest. |
| SES starts in sandbox mode | Ask AWS for production access once the domain is verified; it usually takes about a day. |
| Google's consent screen in "testing" mode allows only 100 users | Publish it once the domain and privacy page exist (basic scopes need only brand verification). |

## 10. Other things a game like this usually has

**Worth doing early:**
- **"Match starting" notice:** a browser notification 5 minutes before (opt-in), an `.ics` link to add the hourly slots to a calendar, and Discord pings for anyone who opts in.
- **Rejoin banner:** "Your match is still on: rejoin" on the menu after a drop.
- **Replays:** the match already records every order, so a replay is the seed plus the order list, a few hundred KB. You could watch any match afterwards.
- **Spectating:** a finished player can stay and watch the rest of their match.
- **Profiles:** matches played, wins, favourite people, recent results.
- **Choice of people:** let a player choose their people when they sign up (first come, first served), instead of random.
- **A status line** on the menu: "Next match 14:00, 3 of 8 seats taken".

**Later:**
- A ranked rating such as Elo alongside the points table.
- Seasons with end-of-season titles or crests.
- Achievements.
- A practice match on demand.
- Friends, private matches with a join code.
- Cosmetic house crests.

**Operations:**
- A free uptime monitor (UptimeRobot or similar) on `/healthz`, with an email when it fails.
- Error reports from browsers sent to the api; the game already builds a problem report.
- A weekly backup restore test in CI.
- A short runbook (`DEPLOY.md`): deploy, roll back, restore, rotate secrets.

## 11. Build order

| Step | What | Branch |
|---|---|---|
| 0 | Merge `grok` into `network`. **Done** (6fd411e). The treaty envoy is now the same on every copy (it was single-player-only, a desync). | network |
| 1 | **Performance pass** for 8 houses (section 2), with a CI budget test. **Done** 2026-10-23 (052b42a, d718554) | grok, then merged |
| 2 | Match container: tickets, 8 seats, referee, repair on desync, preset messages, result. **Done** 2026-10-23: `server/match.js`, `server/ticket.js`, `server/ws.js`, `js/online.js`; `test/match.test.js` | network |
| 3 | api: database, sign-in (email code, Google, Discord, GitHub), usernames, sessions, scheduler, launcher, results, points, league. **Done** 2026-10-23: `server/api.js`, `auth.js`, `db.js`, `service.js`, `launch.js`, `mail.js`, `names.js`; `test/api.test.js` | network |
| 4 | Online menu in the game: sign in, username, next match and countdown, join, league table, messages panel, results screen. **Done** 2026-10-23: `js/onlineui.js`, `main.js` (hourly matches, reconnecting); `tools/online-smoke.cjs` in CI | network |
| 5 | Image, Kubernetes manifests, Caddy, Litestream. **Done** 2026-10-23: `Dockerfile`, `deploy/k8s/` (app, edge, render.mjs), `deploy/host/deploy.sh`, `server/aws.js`; proven on a local k3s (T-093) | network |
| 6 | Terraform (replaces the current single-server compose setup) | network |
| 7 | GitHub Actions: CI, release to staging, promotion to production, Terraform | network |
| 8 | Docs and runbook, then a staging rehearsal with real browsers | network |

Every step comes with tests. Nothing goes public until step 8's rehearsal passes.
