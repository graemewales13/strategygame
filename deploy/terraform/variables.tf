variable "region" {
  description = "AWS region to run the game server in."
  type        = string
  default     = "eu-west-2" # London
}

variable "name" {
  description = "Name used for the instance, security group and other resources."
  type        = string
  default     = "auld-world"
}

variable "instance_type" {
  description = "EC2 size. The relay only passes orders between players, so a small instance serves many matches. Graviton types (t4g.*) are picked up automatically."
  type        = string
  default     = "t3.small"
}

variable "domain" {
  description = "Domain players use, e.g. game.example.com. With a domain, Caddy serves HTTPS (wss) with a free certificate. Leave empty to serve plain HTTP on the instance's IP (fine for testing, not for the public)."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Optional Route 53 hosted zone ID for the domain. If set, Terraform creates the A record pointing at the server. Leave empty to create the DNS record yourself."
  type        = string
  default     = ""
}

variable "repo_url" {
  description = "Git repository to deploy from."
  type        = string
  default     = "https://github.com/graemewales13/strategygame.git"
}

variable "branch" {
  description = "Branch to deploy. Online play and the deploy kit live on the network branch."
  type        = string
  default     = "network"
}

variable "ssh_cidr" {
  description = "Optional CIDR allowed to SSH in (e.g. \"203.0.113.7/32\" for your own IP). Leave empty to keep port 22 closed and use AWS Systems Manager Session Manager instead."
  type        = string
  default     = ""
}

variable "ssh_key_name" {
  description = "Optional existing EC2 key pair name, only needed if you open SSH with ssh_cidr."
  type        = string
  default     = ""
}

variable "root_volume_gb" {
  description = "Size of the instance's disk in GB."
  type        = number
  default     = 16
}
