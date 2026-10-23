output "production_url" {
  description = "Where players go."
  value       = "https://${local.prod_host}"
}
output "staging_url" {
  description = "Staging (test sign-in on, shorter matches)."
  value       = "https://staging.${local.prod_host}"
}
output "public_ip" {
  description = "The server's fixed address. Without a Route 53 zone, point your domain's A records (the domain and staging.<domain>) here."
  value       = aws_eip.server.public_ip
}
output "github_variables" {
  description = "Set these as repository variables in GitHub (Settings, Secrets and variables, Actions, Variables). The deploy workflows read them."
  value = {
    AWS_REGION       = var.region
    AWS_DEPLOY_ROLE  = aws_iam_role.deploy.arn
    AULD_BUCKET      = aws_s3_bucket.data.id
    AULD_INSTANCE_ID = aws_instance.server.id
    AULD_PROD_HOST   = local.prod_host
    AULD_STAGE_HOST  = "staging.${local.prod_host}"
    AULD_MAIL_FROM   = local.mail_from
    AULD_ACME_EMAIL  = var.alert_email
  }
}
output "shell" {
  description = "A shell on the server through Session Manager (needs the AWS CLI and its Session Manager plugin)."
  value       = "aws ssm start-session --region ${var.region} --target ${aws_instance.server.id}"
}
output "email_dns_records" {
  description = "With a domain but no Route 53 zone: add these CNAME records so the sign-in emails are signed (DKIM). Then ask AWS to take SES out of its sandbox (DEPLOY.md)."
  value       = var.domain != "" && var.route53_zone_id == "" ? [for t in aws_sesv2_email_identity.domain[0].dkim_signing_attributes[0].tokens : "${t}._domainkey.${var.domain} CNAME ${t}.dkim.amazonses.com"] : []
}
