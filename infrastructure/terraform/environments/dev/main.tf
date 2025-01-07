# Configure Terraform backend for state management
terraform {
  backend "s3" {
    bucket         = "memoryreel-terraform-state-dev"
    key            = "dev/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "memoryreel-terraform-locks-dev"
    versioning     = true
    backup_retention = 30
    access_logging = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.0"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
  }
}

# Local variables for environment configuration
locals {
  environment = "dev"
  common_tags = {
    Environment = "dev"
    Project     = "MemoryReel"
    ManagedBy   = "Terraform"
    CostCenter  = "development"
    Debug       = "enabled"
  }
  monitoring_config = {
    log_level        = "DEBUG"
    metrics_interval = 60
    alert_threshold  = "development"
  }
}

# AI Service Module Configuration
module "ai" {
  source = "../../modules/ai"

  environment        = local.environment
  openai_api_key     = var.openai_api_key
  aws_region         = var.aws_region
  google_project_id  = var.google_project_id
  tags              = local.common_tags
  monitoring_config = local.monitoring_config
  
  # Development-specific settings
  failover_enabled     = true
  debug_mode          = true
  performance_logging = true
}

# API Service Module Configuration
module "api" {
  source = "../../modules/api"

  environment = local.environment
  instance_type = "t3.small"
  min_capacity = 1
  max_capacity = 2
  tags        = local.common_tags
  
  scaling_config = {
    target_cpu         = 70
    scale_in_cooldown  = 300
    scale_out_cooldown = 180
  }
  
  # Enhanced monitoring for development
  monitoring_enabled    = true
  detailed_monitoring  = true
  log_retention_days   = 30
}

# Storage Module Configuration
module "storage" {
  source = "../../modules/storage"

  environment  = local.environment
  bucket_name  = "memoryreel-media-dev"
  enable_versioning = true
  enable_encryption = true
  tags         = local.common_tags
  
  lifecycle_rules = {
    transition_days               = 90
    storage_class                = "INTELLIGENT_TIERING"
    expiration_days              = 180
    noncurrent_version_expiration = 30
  }
  
  # Development environment specific settings
  backup_enabled = true
  access_logging = true
  cors_enabled   = true
}

# Output AI service endpoints
output "ai_endpoints" {
  value = {
    openai_endpoint       = module.ai.openai_endpoint
    rekognition_endpoint = module.ai.rekognition_endpoint
    google_ai_endpoint   = module.ai.google_ai_endpoint
  }
  description = "AI service endpoints with monitoring information"
}

# Output storage configuration
output "storage_bucket" {
  value = {
    bucket_name     = module.storage.bucket_id
    bucket_region   = var.aws_region
    logging_enabled = true
  }
  description = "Storage bucket configuration with enhanced logging information"
}