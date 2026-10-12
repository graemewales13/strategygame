terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  # State is kept locally in terraform.tfstate by default. To share it or keep it safe, use an S3 backend, for example:
  # backend "s3" {
  #   bucket = "my-terraform-state"
  #   key    = "auld-world/terraform.tfstate"
  #   region = "eu-west-2"
  # }
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
