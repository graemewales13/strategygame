terraform {
  required_version = ">= 1.10" # (S3 state locking without DynamoDB: use_lockfile)
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
  # The state lives in the S3 bucket made once by bootstrap/ (DEPLOY.md, step 1). The bucket's name is given at init:
  #   terraform init -backend-config="bucket=<state bucket>"
  backend "s3" {
    key          = "auld-world/terraform.tfstate"
    region       = "eu-west-2"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project = "auld-world"
      Managed = "terraform"
    }
  }
}
