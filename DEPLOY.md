# Deploying Auld World to AWS

The game and its online relay are one small Node program (`relay.js`, no dependencies). It serves the game's files and runs online matches over a WebSocket at `/ws`. Players open `https://<your domain>/?mp=<room>&name=<name>`.

## Three things that decide the AWS setup

1. **One server, not a fleet.** Rooms and matches live in the relay's memory. Run exactly one copy. Two copies behind a load balancer would split a room between them.
2. **A restart ends the matches in progress.** Players are told the server is restarting. Deploy updates at quiet times.
3. **HTTPS for anything public.** A page served over `https` must use secure WebSockets (`wss://`), which the game does by itself. You need a domain name and a certificate.
   - The relay sends a keep-alive ping every 25 s, so AWS load balancers and proxies don't drop quiet lobbies. It also drops connections that have been silent for 70 s.

The relay is light: it only passes orders between players. Every player's browser runs the game itself. A small instance with 2 vCPU and 2 GB is plenty for many matches at once.

## Recommended: Terraform (`deploy/terraform/`)

Terraform builds the whole server in one command, and removes it all again with another.
- **What it builds:**
  - one EC2 instance (Amazon Linux 2023) running the game and relay in Docker, with Caddy in front for HTTPS
  - a fixed Elastic IP address
  - a security group with 80 and 443 open (SSH stays closed unless you ask)
  - an instance role so you can open a shell through AWS Session Manager instead of SSH
  - optionally, the DNS record in Route 53
- **What happens on first boot:** the server installs Docker, clones the `network` branch, and starts automatically. It starts again after any reboot.

**You need:**
- **Terraform** 1.5 or later (`winget install Hashicorp.Terraform` on Windows).
- **The AWS CLI**, logged in to your account (`aws configure`, or `aws sso login`).
- **Optionally, the Session Manager plugin**, for the shell command.
- **Optionally, a domain:** a domain in Route 53 lets Terraform create the DNS record; any other domain works if you add the record yourself.

**Steps:**
```bash
cd deploy/terraform
copy terraform.tfvars.example terraform.tfvars     # (cp on Mac/Linux) then edit it: region, domain, Route 53 zone ID
terraform init
terraform plan          # shows what will be created; nothing is built yet
terraform apply         # builds it (type yes)
```
Terraform then prints:

| Output | What it is |
|---|---|
| `url` | where to play (add `?mp=<room>&name=<you>` for online) |
| `public_ip` | the fixed address: point your domain's A record here if you did not give a Route 53 zone |
| `health_check` | open it after a few minutes; it should say `ok rooms=0 connections=0` |
| `shell` | opens a shell on the server through Session Manager |
| `update` | deploys the latest commit of the `network` branch (this ends live matches) |

**Settings** (`terraform.tfvars`):

| Setting | Default | Notes |
|---|---|---|
| `region` | `eu-west-2` (London) | |
| `instance_type` | `t3.small` | `t4g.small` is Graviton and cheaper; the right image is chosen automatically |
| `domain` | empty | Leave empty to test on plain HTTP at the IP. Set it for HTTPS: Caddy fetches the certificate once the domain points at the server |
| `route53_zone_id` | empty | If set, Terraform creates the domain's A record |
| `branch` | `network` | |
| `ssh_cidr`, `ssh_key_name` | empty | SSH stays closed; use the `shell` output instead. To open SSH, give your own IP as `x.x.x.x/32` and an existing key pair |

**Day to day:**
- **Updating:** after pushing to `network`, run the `update` command Terraform printed. Changing `branch`, `repo_url` or `domain` and running `terraform apply` builds a fresh server instead (also ending live matches). The address stays the same, because it is an Elastic IP.
- **Logs:** open the `shell`, then `cd /opt/auld-world/deploy && sudo docker compose logs -f relay`. First-boot output is in `/var/log/auld-world-setup.log`.
- **Removing everything:** `terraform destroy`.
- **State:** Terraform keeps track of what it built in `terraform.tfstate`, in that folder. It is ignored by git: keep it safe, or switch to the S3 backend sketched in `versions.tf`.

## By hand: one EC2 (or Lightsail) instance with Docker and Caddy

The same setup Terraform builds, done step by step.

The simplest setup that works well. Caddy gets and renews a free HTTPS certificate automatically and proxies WebSockets with no extra setup.

1. **Launch the instance.**
   - Image: Amazon Linux 2023. Size: `t3.small` or `t4g.small`.
   - Security group: inbound 80 and 443 from anywhere, and 22 from your own IP only.
   - Allocate an **Elastic IP** and attach it, so the address never changes.
   - Lightsail works the same way: open ports 80 and 443 in its networking tab.
2. **Point your domain at it.** In Route 53, or wherever your domain lives, add an `A` record such as `game.example.com` pointing to the Elastic IP. Wait until `ping game.example.com` shows that IP.
3. **Install Docker and fetch the game** (on the instance, over SSH):
   ```bash
   sudo dnf install -y docker git
   sudo systemctl enable --now docker
   sudo usermod -aG docker ec2-user && newgrp docker
   sudo mkdir -p /usr/local/lib/docker/cli-plugins
   sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m) -o /usr/local/lib/docker/cli-plugins/docker-compose
   sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
   git clone -b network https://github.com/graemewales13/strategygame.git && cd strategygame/deploy
   ```
4. **Start it:**
   ```bash
   DOMAIN=game.example.com docker compose up -d --build
   ```
   Caddy fetches the certificate on first start (port 80 must be reachable for that). Check it with:
   ```bash
   curl https://game.example.com/healthz     # should print: ok rooms=0 connections=0
   ```
5. **Play:** everyone opens `https://game.example.com/?mp=myroom&name=YourName`. Single player works at `https://game.example.com/`.

**Updating** (ends live matches):
```bash
cd ~/strategygame && git pull && cd deploy && DOMAIN=game.example.com docker compose up -d --build
```

**Logs:** `docker compose logs -f relay`. Joins, starts, players who drop and any desyncs appear here.

## Alternative: ECS Fargate with an Application Load Balancer

Use this if you prefer managed containers.

- Build and push the image to ECR from the repo root:
  ```bash
  docker build -t auld-world .
  ```
  Then tag the image and push it to your ECR repository.
- **Service:**
  - **Desired count 1**, never more (see "one server" above).
  - Deployment settings: minimum healthy 0%, maximum 100%, so a deploy never runs two copies at once.
  - Container port 8080. The `PORT` environment variable is already 8080.
- **Target group:**
  - Protocol HTTP, port 8080.
  - Health check path `/healthz`.
  - Stickiness is not needed with one task.
- **Load balancer:**
  - An HTTPS listener on 443 with an ACM certificate for your domain, forwarding to the target group.
  - An HTTP 80 listener that redirects to 443.
  - Raise the **idle timeout** to 300 s (the relay pings every 25 s anyway).
  - ALB supports WebSockets with no extra setup.
- **DNS:** a Route 53 alias record from your domain to the load balancer.

## Not suitable as it stands

- **App Runner:** at the time of writing it does not support WebSocket connections. Check the current AWS documentation before relying on it.
- **Lambda with API Gateway WebSockets:** the relay keeps rooms and a turn clock in memory and runs timers. It would need rewriting around a database and scheduled functions.
- **More than one relay behind a load balancer:** see "one server" above. Scaling out needs a shared room store first (roadmap T15).

## Optional

- **Static files on S3 and CloudFront:** the relay already serves the game's files, so this only matters at large scale. If you do it, add `&relay=wss://<relay host>/ws` to the online links, or set the default in `js/main.js`.
- **Monitoring:** point a CloudWatch alarm or Route 53 health check at `/healthz`.
- **Limits** (in `relay.js`):
  - 500 rooms
  - 8 people per room (5 seats and 3 watchers)
  - 1 MB per message
  - 40 orders per player per turn

  There are no accounts yet: anyone with the address can make a room. Put AWS WAF in front if abuse ever becomes a problem.

## Check before going public

- [ ] `https://<domain>/healthz` says `ok`.
- [ ] Two browsers on different networks (for example a phone on mobile data) can join one room, the host can start, and orders show on both screens. The status line in the bottom right should never say "out of step".
- [ ] Reloading one player rejoins the same seat.
- [ ] After an update, players get the "server is restarting" message, not a silent drop.
