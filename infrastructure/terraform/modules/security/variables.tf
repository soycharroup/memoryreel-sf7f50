# Environment configuration
variable "environment" {
  description = "Deployment environment (dev/staging/prod) for environment-specific security configurations"
  type        = string
  
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

# VPC configuration
variable "vpc_id" {
  description = "ID of the VPC where security groups will be created for network isolation"
  type        = string
  
  validation {
    condition     = can(regex("^vpc-", var.vpc_id))
    error_message = "VPC ID must be a valid AWS VPC identifier"
  }
}

# KMS key configuration
variable "key_deletion_window" {
  description = "Number of days before KMS key deletion (between 7 and 30) for AES-256 encryption"
  type        = number
  default     = 30
  
  validation {
    condition     = var.key_deletion_window >= 7 && var.key_deletion_window <= 30
    error_message = "Key deletion window must be between 7 and 30 days"
  }
}

# WAF configuration
variable "waf_rate_limit" {
  description = "Maximum number of requests allowed from an IP in 5 minutes for DDoS protection"
  type        = number
  default     = 2000
  
  validation {
    condition     = var.waf_rate_limit >= 100
    error_message = "WAF rate limit must be at least 100 requests"
  }
}

# Security group configuration
variable "allowed_cidr_blocks" {
  description = "List of CIDR blocks allowed to access the application through security groups"
  type        = list(string)
  default     = ["0.0.0.0/0"]
  
  validation {
    condition     = alltrue([for cidr in var.allowed_cidr_blocks : can(cidrhost(cidr, 0))])
    error_message = "All elements must be valid CIDR blocks"
  }
}