# Core Terraform functionality for variable definitions
# terraform ~> 1.0

variable "environment" {
  type        = string
  description = "Environment name (dev/staging/prod)"
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be dev, staging, or prod"
  }
}

variable "domain_name" {
  type        = string
  description = "Custom domain name for CloudFront distribution"
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-\\.]{1,61}[a-z0-9]\\.[a-z]{2,}$", var.domain_name))
    error_message = "Domain name must be a valid hostname"
  }
}

variable "ssl_certificate_arn" {
  type        = string
  description = "ARN of ACM certificate for HTTPS"
  validation {
    condition     = can(regex("^arn:aws:acm:[a-z0-9-]+:[0-9]{12}:certificate/[a-z0-9-]+$", var.ssl_certificate_arn))
    error_message = "Must be a valid ACM certificate ARN"
  }
}

variable "price_class" {
  type        = string
  description = "CloudFront distribution price class"
  default     = "PriceClass_All"
  validation {
    condition     = can(regex("^PriceClass_(All|100|200)$", var.price_class))
    error_message = "Price class must be PriceClass_All, PriceClass_100, or PriceClass_200"
  }
}

variable "allowed_methods" {
  type        = list(string)
  description = "HTTP methods allowed by CloudFront"
  default     = ["GET", "HEAD", "OPTIONS"]
  validation {
    condition     = alltrue([for m in var.allowed_methods : contains(["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"], m)])
    error_message = "Invalid HTTP method specified"
  }
}

variable "cached_methods" {
  type        = list(string)
  description = "HTTP methods that CloudFront will cache"
  default     = ["GET", "HEAD"]
  validation {
    condition     = alltrue([for m in var.cached_methods : contains(["GET", "HEAD", "OPTIONS"], m)])
    error_message = "Only GET, HEAD, and OPTIONS can be cached"
  }
}

variable "min_ttl" {
  type        = number
  description = "Minimum time to live for cached objects (seconds)"
  default     = 0
  validation {
    condition     = var.min_ttl >= 0
    error_message = "Minimum TTL cannot be negative"
  }
}

variable "default_ttl" {
  type        = number
  description = "Default time to live for cached objects (seconds)"
  default     = 3600
  validation {
    condition     = var.default_ttl >= var.min_ttl
    error_message = "Default TTL must be greater than or equal to minimum TTL"
  }
}

variable "max_ttl" {
  type        = number
  description = "Maximum time to live for cached objects (seconds)"
  default     = 86400
  validation {
    condition     = var.max_ttl >= var.default_ttl
    error_message = "Maximum TTL must be greater than or equal to default TTL"
  }
}