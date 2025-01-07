# Provider configuration with enhanced security and monitoring
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }

  # Enhanced S3 backend configuration with encryption and locking
  backend "s3" {
    bucket         = "memoryreel-terraform-state"
    key            = "staging/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "memoryreel-terraform-locks"
    kms_key_id     = "alias/terraform-state-key"
  }
}

# Primary AWS provider configuration
provider "aws" {
  region = "us-east-1"
  
  default_tags {
    tags = {
      Environment = "staging"
      Project     = "memoryreel"
      ManagedBy   = "terraform"
      CostCenter  = "staging-ops"
      SecurityLevel = "high"
    }
  }
}

# Secondary region provider for disaster recovery
provider "aws" {
  alias  = "dr"
  region = "us-west-2"
}

# Local variables for common configuration
locals {
  project_name = "memoryreel"
  environment = "staging"
  common_tags = {
    Environment = local.environment
    Project     = local.project_name
    ManagedBy   = "terraform"
    LastUpdated = timestamp()
  }
}

# Storage module with enhanced configuration
module "storage" {
  source = "../../modules/storage"
  
  project_name = local.project_name
  environment  = local.environment
  
  lifecycle_rules = {
    transition_days               = 30
    storage_class                = "INTELLIGENT_TIERING"
    expiration_days              = 365
    noncurrent_version_expiration = 90
  }
  
  cdn_settings = {
    price_class            = "PriceClass_100"
    min_ttl               = 0
    default_ttl           = 3600
    max_ttl               = 86400
    compress              = true
    viewer_protocol_policy = "redirect-to-https"
    geo_restrictions      = ["US", "CA", "EU"]
  }
  
  replication_settings = {
    enabled             = true
    destination_region  = "us-west-2"
    storage_class       = "STANDARD_IA"
    replica_kms_key_id  = aws_kms_key.replica_key.id
  }
  
  backup_settings = {
    retention_days          = 30
    transition_to_glacier   = true
    glacier_transition_days = 90
  }
}

# AI module with enhanced monitoring and failover
module "ai" {
  source = "../../modules/ai"
  
  project_name = local.project_name
  environment  = local.environment
  aws_region   = "us-east-1"
  
  face_detection_confidence = 98
  max_faces_per_image      = 20
  ai_failover_timeout      = 30
  enable_ai_monitoring     = true
  
  openai_api_key     = var.openai_api_key
  google_project_id  = var.google_project_id
  vision_ai_location = "us-east1"
  
  tags = local.common_tags
}

# KMS key for cross-region replication
resource "aws_kms_key" "replica_key" {
  provider = aws.dr
  
  description             = "KMS key for S3 replication encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  
  tags = local.common_tags
}

# CloudWatch dashboard for environment monitoring
resource "aws_cloudwatch_dashboard" "staging_dashboard" {
  dashboard_name = "${local.project_name}-${local.environment}-dashboard"
  
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          metrics = [
            ["MemoryReel/Storage", "BucketSizeBytes", "Environment", local.environment],
            ["MemoryReel/AI", "ProcessingLatency", "Environment", local.environment],
            ["MemoryReel/CDN", "Requests", "Environment", local.environment]
          ]
          period = 300
          stat   = "Average"
          region = "us-east-1"
          title  = "Key Metrics"
        }
      }
    ]
  })
}

# Outputs for environment information
output "storage_endpoints" {
  description = "Storage endpoints for the staging environment"
  value = {
    s3_bucket         = module.storage.bucket_id
    cdn_domain        = module.storage.cdn_domain_name
    replication_status = module.storage.bucket_replication_status
  }
}

output "ai_endpoints" {
  description = "AI service endpoints for the staging environment"
  value = {
    rekognition_collection = module.ai.rekognition_collection_id
    vision_ai_endpoint     = module.ai.vision_ai_endpoint
    monitoring_dashboard   = aws_cloudwatch_dashboard.staging_dashboard.dashboard_arn
  }
}