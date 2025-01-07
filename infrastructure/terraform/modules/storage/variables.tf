# Core environment variable with validation
variable "environment" {
  type        = string
  description = "Deployment environment (dev, staging, prod) with strict validation"
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be dev, staging, or prod"
  }
}

# Project name variable
variable "project_name" {
  type        = string
  description = "Name of the project for resource naming and tagging"
  default     = "memoryreel"
}

# Lifecycle management configuration
variable "lifecycle_rules" {
  type = object({
    transition_days               = number
    storage_class                = string
    expiration_days              = number
    noncurrent_version_expiration = number
  })
  description = "Comprehensive S3 bucket lifecycle rules for intelligent tiering and content management"
  default = {
    transition_days               = 30
    storage_class                = "INTELLIGENT_TIERING"
    expiration_days              = 365
    noncurrent_version_expiration = 90
  }
}

# CORS configuration
variable "cors_rules" {
  type = list(object({
    allowed_headers = list(string)
    allowed_methods = list(string)
    allowed_origins = list(string)
    expose_headers  = list(string)
    max_age_seconds = number
  }))
  description = "CORS configuration for secure cross-origin access"
  default = [{
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag", "x-amz-server-side-encryption"]
    max_age_seconds = 3600
  }]
}

# CloudFront CDN settings
variable "cdn_settings" {
  type = object({
    price_class            = string
    min_ttl               = number
    default_ttl           = number
    max_ttl               = number
    compress              = bool
    viewer_protocol_policy = string
    geo_restrictions      = list(string)
  })
  description = "Advanced CloudFront CDN configuration for global content delivery"
  default = {
    price_class            = "PriceClass_All"
    min_ttl               = 0
    default_ttl           = 3600
    max_ttl               = 86400
    compress              = true
    viewer_protocol_policy = "redirect-to-https"
    geo_restrictions      = []
  }
}

# Encryption configuration
variable "encryption_settings" {
  type = object({
    algorithm            = string
    kms_master_key_id    = string
    key_rotation_enabled = bool
    key_deletion_window  = number
  })
  description = "Enhanced encryption configuration with KMS integration"
  default = {
    algorithm            = "aws:kms"
    kms_master_key_id    = null
    key_rotation_enabled = true
    key_deletion_window  = 7
  }
}

# Versioning configuration
variable "versioning_enabled" {
  type        = bool
  description = "Enable versioning for data protection and recovery"
  default     = true
}

# Replication configuration
variable "replication_settings" {
  type = object({
    enabled             = bool
    destination_region  = string
    storage_class       = string
    replica_kms_key_id  = string
  })
  description = "Cross-region replication configuration for disaster recovery"
  default = {
    enabled             = false
    destination_region  = "us-west-2"
    storage_class       = "STANDARD_IA"
    replica_kms_key_id  = null
  }
}

# Backup configuration
variable "backup_settings" {
  type = object({
    retention_days          = number
    transition_to_glacier   = bool
    glacier_transition_days = number
  })
  description = "Backup configuration for data retention and compliance"
  default = {
    retention_days          = 30
    transition_to_glacier   = true
    glacier_transition_days = 90
  }
}