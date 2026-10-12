output "public_ip" {
  description = "The server's fixed address (Elastic IP). Point your domain's A record here if Terraform did not."
  value       = aws_eip.game.public_ip
}

output "url" {
  description = "Where to play. Online: add ?mp=<room>&name=<you>."
  value       = local.site_url
}

output "health_check" {
  description = "Should answer: ok rooms=0 connections=0 (give the first boot a few minutes)."
  value       = "${local.site_url}/healthz"
}

output "shell" {
  description = "Open a shell on the server without SSH (needs the AWS CLI and the Session Manager plugin)."
  value       = "aws ssm start-session --region ${var.region} --target ${aws_instance.game.id}"
}

output "update" {
  description = "Deploy the latest commit of the branch (ends live matches)."
  value       = "aws ssm send-command --region ${var.region} --instance-ids ${aws_instance.game.id} --document-name AWS-RunShellScript --parameters commands=auld-update"
}
