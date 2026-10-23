# Auld World on AWS (ONLINE.md sections 7 and 8): one t4g.small running k3s, a fixed address, a private S3 bucket for the database copies and
# the releases, the secrets in SSM Parameter Store, a role GitHub Actions may take to deploy (OIDC: no stored AWS keys), a monthly budget
# alarm, and (once there is a domain) its DNS records and email sending. The Kubernetes side is applied by deploys, not here.

locals {
  arm       = can(regex("^[a-z]+[0-9]+g[a-z]*\\.", var.instance_type)) # t4g, m7g, c7gd ...: Graviton
  prod_host = var.domain != "" ? var.domain : "${replace(aws_eip.server.public_ip, ".", "-")}.sslip.io"
  mail_from = var.domain != "" ? "Auld World <${var.mail_from}@${var.domain}>" : ""
  use_zone  = var.domain != "" && var.route53_zone_id != ""
}

data "aws_caller_identity" "me" {}
data "aws_partition" "here" {}

# ---- where the server stands ----------------------------------------------------------------------------------------------------
data "aws_ssm_parameter" "ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-${local.arm ? "arm64" : "x86_64"}"
}
data "aws_vpc" "default" {
  default = true
}
data "aws_ec2_instance_type_offerings" "here" {
  location_type = "availability-zone"
  filter {
    name   = "instance-type"
    values = [var.instance_type]
  }
}
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
  filter {
    name   = "availability-zone"
    values = data.aws_ec2_instance_type_offerings.here.locations
  }
}

resource "aws_security_group" "server" {
  name        = "${var.name}-server"
  description = "Auld World: HTTP and HTTPS in (Caddy); everything out. No SSH: use Session Manager."
  vpc_id      = data.aws_vpc.default.id
  tags        = { Name = "${var.name}-server" }
}
resource "aws_vpc_security_group_ingress_rule" "web" {
  for_each          = { http4 = [80, "0.0.0.0/0", null], https4 = [443, "0.0.0.0/0", null], http6 = [80, null, "::/0"], https6 = [443, null, "::/0"] }
  security_group_id = aws_security_group.server.id
  ip_protocol       = "tcp"
  from_port         = each.value[0]
  to_port           = each.value[0]
  cidr_ipv4         = each.value[1]
  cidr_ipv6         = each.value[2]
}
resource "aws_vpc_security_group_egress_rule" "all4" {
  security_group_id = aws_security_group.server.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}
resource "aws_vpc_security_group_egress_rule" "all6" {
  security_group_id = aws_security_group.server.id
  ip_protocol       = "-1"
  cidr_ipv6         = "::/0"
}

# ---- the bucket: database copies (Litestream, db/<env>/) and releases (releases/<version>/) ------------------------------------------
resource "random_id" "bucket" {
  byte_length = 4
}
resource "aws_s3_bucket" "data" {
  bucket = "${var.name}-${data.aws_caller_identity.me.account_id}-${random_id.bucket.hex}"
}
resource "aws_s3_bucket_public_access_block" "data" {
  bucket                  = aws_s3_bucket.data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_ownership_controls" "data" {
  bucket = aws_s3_bucket.data.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}
resource "aws_s3_bucket_versioning" "data" {
  bucket = aws_s3_bucket.data.id
  versioning_configuration {
    status = "Enabled"
  }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
resource "aws_s3_bucket_lifecycle_configuration" "data" {
  bucket = aws_s3_bucket.data.id
  rule {
    id     = "old-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
  rule {
    id     = "old-releases"
    status = "Enabled"
    filter {
      prefix = "releases/"
    }
    expiration {
      days = 180
    }
  }
}
data "aws_iam_policy_document" "bucket" {
  statement {
    sid       = "TlsOnly"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.data.arn, "${aws_s3_bucket.data.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}
resource "aws_s3_bucket_policy" "data" {
  bucket     = aws_s3_bucket.data.id
  policy     = data.aws_iam_policy_document.bucket.json
  depends_on = [aws_s3_bucket_public_access_block.data]
}

# ---- secrets: made here, kept in SSM Parameter Store (encrypted), read by the server at each deploy -------------------------------
# OAuth client ids and secrets and the Discord webhook are added by you, the same way (DEPLOY.md): /auld/<env>/google-client-id and so on.
resource "random_password" "secret" {
  for_each = toset(["production/session-secret", "production/match-secret", "staging/session-secret", "staging/match-secret"])
  length   = 48
  special  = false
}
resource "aws_ssm_parameter" "secret" {
  for_each = random_password.secret
  name     = "/auld/${each.key}"
  type     = "SecureString"
  value    = each.value.result
}

# ---- the server's role: Session Manager, its bucket, its secrets, sending email --------------------------------------------------
data "aws_iam_policy_document" "ec2_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}
resource "aws_iam_role" "server" {
  name               = "${var.name}-server"
  assume_role_policy = data.aws_iam_policy_document.ec2_trust.json
}
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.server.name
  policy_arn = "arn:${data.aws_partition.here.partition}:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
data "aws_iam_policy_document" "server" {
  statement {
    sid       = "Bucket"
    actions   = ["s3:ListBucket", "s3:GetBucketLocation"]
    resources = [aws_s3_bucket.data.arn]
  }
  statement {
    sid       = "DatabaseCopies"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.data.arn}/db/*"]
  }
  statement {
    sid       = "Releases"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.data.arn}/releases/*"]
  }
  statement {
    sid       = "Secrets"
    actions   = ["ssm:GetParametersByPath", "ssm:GetParameter", "ssm:GetParameters"]
    resources = ["arn:${data.aws_partition.here.partition}:ssm:${var.region}:${data.aws_caller_identity.me.account_id}:parameter/auld/*"]
  }
  statement {
    sid       = "SecretsKey"
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.region}.amazonaws.com"]
    }
  }
  dynamic "statement" {
    for_each = var.domain != "" ? [1] : []
    content {
      sid       = "SendSignInCodes"
      actions   = ["ses:SendEmail"]
      resources = [aws_sesv2_email_identity.domain[0].arn]
    }
  }
}
resource "aws_iam_role_policy" "server" {
  role   = aws_iam_role.server.id
  policy = data.aws_iam_policy_document.server.json
}
resource "aws_iam_instance_profile" "server" {
  name = "${var.name}-server"
  role = aws_iam_role.server.name
}

# ---- the server ----------------------------------------------------------------------------------------------------------------
resource "aws_instance" "server" {
  ami                    = data.aws_ssm_parameter.ami.insecure_value
  instance_type          = var.instance_type
  subnet_id              = sort(data.aws_subnets.default.ids)[0]
  vpc_security_group_ids = [aws_security_group.server.id]
  iam_instance_profile   = aws_iam_instance_profile.server.name
  credit_specification {
    cpu_credits = var.cpu_credits
  }
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required" # IMDSv2 only
    http_put_response_hop_limit = 2          # (a pod is one hop further: the api and Litestream use the server's role)
  }
  root_block_device {
    volume_size = var.root_volume_gb
    volume_type = "gp3"
    encrypted   = true
  }
  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    bucket        = aws_s3_bucket.data.id
    region        = var.region
    k3s_version   = var.k3s_version
    swap_gb       = var.swap_gb
    deploy_sh_b64 = filebase64("${path.module}/../host/deploy.sh")
  })
  user_data_replace_on_change = false
  lifecycle {
    ignore_changes = [ami, user_data] # (a newer image or first-boot script is for the next server, not a reason to replace this one)
  }
  tags = { Name = var.name }
}
resource "aws_eip" "server" {
  domain = "vpc"
  tags   = { Name = var.name }
}
resource "aws_eip_association" "server" {
  instance_id   = aws_instance.server.id
  allocation_id = aws_eip.server.id
}

# ---- deploying from GitHub Actions: OIDC, no stored keys; only this repository's staging and production environments -------------
variable "github_oidc_provider_arn" {
  description = "If this AWS account already has GitHub's OIDC provider (token.actions.githubusercontent.com), its ARN; empty makes one."
  type        = string
  default     = ""
}
resource "aws_iam_openid_connect_provider" "github" {
  count           = var.github_oidc_provider_arn == "" ? 1 : 0
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
}
locals {
  github_oidc = var.github_oidc_provider_arn != "" ? var.github_oidc_provider_arn : aws_iam_openid_connect_provider.github[0].arn
}
data "aws_iam_policy_document" "deploy_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.github_oidc]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:environment:staging", "repo:${var.github_repo}:environment:production"]
    }
  }
}
resource "aws_iam_role" "deploy" {
  name               = "${var.name}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.deploy_trust.json
}
data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "UploadReleases"
    actions   = ["s3:PutObject", "s3:GetObject"]
    resources = ["${aws_s3_bucket.data.arn}/releases/*"]
  }
  statement {
    sid     = "RunDeployOnTheServer"
    actions = ["ssm:SendCommand"]
    resources = [
      "arn:${data.aws_partition.here.partition}:ssm:${var.region}::document/AWS-RunShellScript",
      aws_instance.server.arn,
    ]
  }
  statement {
    sid       = "ReadTheOutcome"
    actions   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"]
    resources = ["*"]
  }
}
resource "aws_iam_role_policy" "deploy" {
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}

# ---- the domain, once there is one: the game's two names, and email signed with DKIM ------------------------------------------------
resource "aws_route53_record" "game" {
  for_each = local.use_zone ? toset([var.domain, "staging.${var.domain}"]) : toset([])
  zone_id  = var.route53_zone_id
  name     = each.value
  type     = "A"
  ttl      = 300
  records  = [aws_eip.server.public_ip]
}
resource "aws_sesv2_email_identity" "domain" {
  count          = var.domain != "" ? 1 : 0
  email_identity = var.domain
}
resource "aws_route53_record" "dkim" {
  count   = local.use_zone ? 3 : 0 # (Easy DKIM always gives three)
  zone_id = var.route53_zone_id
  name    = "${aws_sesv2_email_identity.domain[0].dkim_signing_attributes[0].tokens[count.index]}._domainkey.${var.domain}"
  type    = "CNAME"
  ttl     = 1800
  records = ["${aws_sesv2_email_identity.domain[0].dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"]
}

# ---- the budget: an email at 80% spent, and when the month's forecast passes it ------------------------------------------------
resource "aws_budgets_budget" "monthly" {
  name         = "${var.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}
