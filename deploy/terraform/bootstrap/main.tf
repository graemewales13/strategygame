# Run once, before the main stack: the bucket that keeps Terraform's own state (private, versioned, encrypted). Its state stays on your
# machine (terraform.tfstate in this folder): keep that file, though losing it only means this one bucket must be imported to change it.
#   cd deploy/terraform/bootstrap && terraform init && terraform apply
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}
variable "region" {
  type    = string
  default = "eu-west-2"
}
provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "auld-world", Managed = "terraform" }
  }
}
data "aws_caller_identity" "me" {}
resource "aws_s3_bucket" "state" {
  bucket = "auld-world-tfstate-${data.aws_caller_identity.me.account_id}"
  lifecycle {
    prevent_destroy = true
  }
}
resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
output "state_bucket" {
  description = "Give this to the main stack: terraform init -backend-config=\"bucket=<this>\""
  value       = aws_s3_bucket.state.id
}
