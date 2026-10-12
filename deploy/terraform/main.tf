# One EC2 instance running the game and its online relay in Docker, with Caddy in front for HTTPS.
# One server only: rooms and matches live in the relay's memory (see DEPLOY.md).

locals {
  # t4g, m7g, c7g ... are Graviton (arm64); everything else is x86_64
  arm64     = can(regex("^[a-z]+[0-9]+g[a-z]*\\.", var.instance_type))
  ami_param = local.arm64 ? "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64" : "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
  # Caddy: a domain gets HTTPS with a Let's Encrypt certificate; no domain serves plain HTTP on port 80
  caddy_site = var.domain != "" ? var.domain : ":80"
  site_url   = var.domain != "" ? "https://${var.domain}" : "http://${aws_eip.game.public_ip}"
}

data "aws_ssm_parameter" "al2023" {
  name = local.ami_param
}

data "aws_vpc" "default" {
  default = true
}

# ---- network: web ports open to everyone, SSH only if you ask for it --------------------------------------------------------
resource "aws_security_group" "game" {
  name        = "${var.name}-web"
  description = "Auld World: HTTP and HTTPS (the game and its WebSocket relay)"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.game.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
  description       = "HTTP (and Let's Encrypt certificate checks)"
}

resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.game.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  description       = "HTTPS and secure WebSockets"
}

resource "aws_vpc_security_group_ingress_rule" "ssh" {
  count             = var.ssh_cidr != "" ? 1 : 0
  security_group_id = aws_security_group.game.id
  cidr_ipv4         = var.ssh_cidr
  from_port         = 22
  to_port           = 22
  ip_protocol       = "tcp"
  description       = "SSH from the owner only"
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.game.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
  description       = "Outbound: packages, git, Docker images, certificates"
}

# ---- an instance role so you can open a shell with Session Manager instead of SSH ------------------------------------------
resource "aws_iam_role" "game" {
  name = "${var.name}-instance"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.game.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "game" {
  name = "${var.name}-instance"
  role = aws_iam_role.game.name
}

# ---- the server -------------------------------------------------------------------------------------------------------------
resource "aws_instance" "game" {
  ami                    = data.aws_ssm_parameter.al2023.value
  instance_type          = var.instance_type
  vpc_security_group_ids = [aws_security_group.game.id]
  iam_instance_profile   = aws_iam_instance_profile.game.name
  key_name               = var.ssh_key_name != "" ? var.ssh_key_name : null

  # (line endings normalised: a Windows checkout would otherwise hand the server a script with carriage returns in it)
  user_data = replace(templatefile("${path.module}/user_data.sh.tftpl", {
    repo_url   = var.repo_url
    branch     = var.branch
    caddy_site = local.caddy_site
  }), "\r\n", "\n")
  # a changed repo, branch or domain rebuilds the server (and ends live matches); day-to-day updates use auld-update instead
  user_data_replace_on_change = true

  metadata_options {
    http_tokens = "required" # IMDSv2 only
  }

  root_block_device {
    volume_size = var.root_volume_gb
    volume_type = "gp3"
    encrypted   = true
  }

  tags = { Name = var.name }

  lifecycle {
    ignore_changes = [ami] # a newer Amazon Linux image must not replace a running server by itself
  }
}

# a fixed address that survives stops and rebuilds, for DNS
resource "aws_eip" "game" {
  domain = "vpc"
  tags   = { Name = var.name }
}

resource "aws_eip_association" "game" {
  instance_id   = aws_instance.game.id
  allocation_id = aws_eip.game.id
}

# optional: the DNS record, if the domain is in a Route 53 hosted zone you name
resource "aws_route53_record" "game" {
  count   = var.domain != "" && var.route53_zone_id != "" ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain
  type    = "A"
  ttl     = 300
  records = [aws_eip.game.public_ip]
}
