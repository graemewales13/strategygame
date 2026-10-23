variable "alert_email" {
  description = "Your email address: budget alerts go here, and Let's Encrypt writes here if a certificate ever needs attention."
  type        = string
  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alert_email))
    error_message = "alert_email must be an email address."
  }
}

variable "region" {
  description = "AWS region for everything."
  type        = string
  default     = "eu-west-2" # London
}

variable "name" {
  description = "Prefix for the names of what is made here."
  type        = string
  default     = "auld-world"
}

variable "instance_type" {
  description = "The server. t4g.small (2 vCPU, 2 GB, Graviton) runs k3s, the api, the front door and a couple of matches at a time (ONLINE.md section 8)."
  type        = string
  default     = "t4g.small"
}

variable "cpu_credits" {
  description = "standard: when the server's CPU allowance is used up it slows to its baseline and costs nothing extra (the safe choice for a fixed budget). unlimited: it keeps full speed and AWS charges for the extra, about $0.04 per vCPU-hour."
  type        = string
  default     = "standard"
  validation {
    condition     = contains(["standard", "unlimited"], var.cpu_credits)
    error_message = "cpu_credits must be standard or unlimited."
  }
}

variable "root_volume_gb" {
  description = "The server's disk (gp3, encrypted): the system, k3s, the images, the database."
  type        = number
  default     = 20
}

variable "swap_gb" {
  description = "Swap file on the server: room to breathe when two matches overlap on 2 GB of memory."
  type        = number
  default     = 2
}

variable "k3s_version" {
  description = "The k3s (Kubernetes) release installed on first boot. Pinned: an upgrade is a deliberate change."
  type        = string
  default     = "v1.33.4+k3s1"
}

variable "domain" {
  description = "The game's domain, e.g. play.example.com (staging is staging.<domain>). Leave empty until you have one: the server is then reached at <its address>.sslip.io, still with HTTPS, but email codes and Google sign-in wait for a domain."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone of the domain, if it is in Route 53: Terraform then makes the DNS records for the game and for email (SES). Empty: you add the records yourself (the outputs list them)."
  type        = string
  default     = ""
}

variable "mail_from" {
  description = "The local part of the sign-in emails' sender, e.g. play gives play@<domain>."
  type        = string
  default     = "play"
}

variable "github_repo" {
  description = "owner/name of the GitHub repository whose Actions may deploy (through OIDC: no stored AWS keys)."
  type        = string
  default     = "graemewales13/strategygame"
}

variable "budget_usd" {
  description = "Monthly budget in US dollars: an email at 80% of it spent, and when the month's forecast passes it. 25 USD is about 20 GBP."
  type        = number
  default     = 25
}
