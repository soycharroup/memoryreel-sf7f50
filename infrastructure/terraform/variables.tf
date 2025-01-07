# Core project variables with enhanced validation
variable "project" {
  type        = string
  description = "Name of the MemoryReel project"
  default     = "memoryreel"

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.project))
    error_message = "Project name must be lowercase alphanumeric with hyphens only."
  }
}

variable "environment" {
  type        = string
  description = "Deployment environment (dev, staging, prod)"

  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be dev, staging, or prod."
  }
}

# Regional configuration with DR support
variable "aws_region" {
  type        = string
  description = "Primary AWS region for deployment"
  default     = "us-east-1"

  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-\\d{1}$", var.aws_region))
    error_message = "AWS region must be in valid format (e.g., us-east-1)."
  }
}

variable "dr_region" {
  type        = string
  description = "Disaster recovery AWS region"
  default     = "us-west-2"

  validation {
    condition     = var.dr_region != var.aws_region
    error_message = "DR region must be different from primary region."
  }
}

variable "enable_dr" {
  type        = bool
  description = "Enable disaster recovery configuration"
  default     = true
}

# Network configuration
variable "vpc_cidr" {
  type        = string
  description = "CIDR block for VPC"
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR must be in valid format."
  }
}

# Enhanced monitoring configuration
variable "monitoring_config" {
  type = object({
    enable_monitoring      = bool
    datadog_api_key       = string
    alert_endpoints       = list(string)
    metrics_retention_days = number
  })
  description = "Monitoring configuration settings"
  
  default = {
    enable_monitoring      = true
    datadog_api_key       = null
    alert_endpoints       = []
    metrics_retention_days = 90
  }
}

# Advanced backup configuration
variable "backup_config" {
  type = object({
    enable_backups    = bool
    retention_days    = number
    backup_schedule   = string
    cross_region_copy = bool
  })
  description = "Backup configuration settings"
  
  default = {
    enable_backups    = true
    retention_days    = 30
    backup_schedule   = "0 0 * * *"
    cross_region_copy = true
  }

  validation {
    condition     = var.backup_config.retention_days >= 30
    error_message = "Backup retention must be at least 30 days."
  }
}

# Enhanced security configuration
variable "security_config" {
  type = object({
    enable_waf        = bool
    enable_guardduty  = bool
    enable_cloudtrail = bool
    ssl_policy        = string
  })
  description = "Security configuration settings"
  
  default = {
    enable_waf        = true
    enable_guardduty  = true
    enable_cloudtrail = true
    ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"
  }
}

# AI service configuration
variable "ai_config" {
  type = object({
    openai_api_key            = string
    face_detection_confidence = number
    ai_provider_failover      = bool
  })
  description = "AI service configuration with failover support"
  sensitive   = true
}

# Storage configuration
variable "storage_config" {
  type = object({
    cdn_settings = object({
      price_class            = string
      min_ttl               = number
      default_ttl           = number
      max_ttl               = number
      compress              = bool
      viewer_protocol_policy = string
      geo_restrictions      = list(string)
    })
    encryption_settings = object({
      algorithm            = string
      kms_master_key_id    = string
      key_rotation_enabled = bool
      key_deletion_window  = number
    })
    backup_strategy = object({
      retention_days          = number
      transition_to_glacier   = bool
      glacier_transition_days = number
    })
  })
  description = "Storage and CDN configuration settings"
}

# Database configuration
variable "database_config" {
  type = object({
    mongodb_variables = object({
      instance_size     = string
      sharding_enabled  = bool
      backup_enabled    = bool
      replication_factor = number
    })
    redis_variables = object({
      node_type        = string
      num_cache_nodes  = number
      multi_az_enabled = bool
    })
    replication_strategy = object({
      cross_region_replica = bool
      replica_regions     = list(string)
    })
  })
  description = "Database configuration with replication support"
}

# Tags configuration
variable "tags" {
  type        = map(string)
  description = "Additional resource tags"
  default     = {}
}

# Outputs for module consumption
output "global_variables" {
  description = "Global variables for module consumption"
  value = {
    project         = var.project
    environment     = var.environment
    aws_region      = var.aws_region
    security_config = var.security_config
  }
}