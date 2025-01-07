# Configure Terraform backend for state management
terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
  }

  backend "s3" {
    bucket         = "memoryreel-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "memoryreel-terraform-locks"
  }
}

# Provider configurations
provider "aws" {
  region = local.aws_region

  default_tags {
    tags = {
      Environment = local.environment
      Project     = local.project_name
      ManagedBy   = "terraform"
    }
  }
}

provider "google" {
  project = local.google_project_id
  region  = "us-east1"
}

# Local variables
locals {
  environment       = "prod"
  project_name     = "memoryreel"
  aws_region       = "us-east-1"
  google_project_id = "memoryreel-prod"

  # High availability configuration
  availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]
  
  # Monitoring thresholds
  monitoring_config = {
    cpu_threshold    = 70
    memory_threshold = 80
    latency_threshold = 2
  }
}

# API Infrastructure Module
module "api" {
  source = "../../modules/api"

  environment            = local.environment
  vpc_id                = aws_vpc.main.id
  subnet_ids            = aws_subnet.private[*].id
  api_port              = 3000
  api_image             = "memoryreel/api:1.0.0"
  desired_count         = 8
  cpu                   = 2048
  memory               = 4096
  health_check_path    = "/health"
  ecs_execution_role_arn = aws_iam_role.ecs_execution.arn
  ecs_task_role_arn     = aws_iam_role.ecs_task.arn

  tags = {
    Component = "API"
  }
}

# Storage Infrastructure Module
module "storage" {
  source = "../../modules/storage"

  environment     = local.environment
  project_name    = local.project_name

  lifecycle_rules = {
    transition_days               = 30
    storage_class                = "INTELLIGENT_TIERING"
    expiration_days              = 365
    noncurrent_version_expiration = 90
  }

  cdn_settings = {
    price_class            = "PriceClass_All"
    min_ttl               = 0
    default_ttl           = 3600
    max_ttl               = 86400
    compress              = true
    viewer_protocol_policy = "redirect-to-https"
    geo_restrictions      = ["US", "CA", "GB", "DE", "FR", "AU"]
  }

  replication_settings = {
    enabled             = true
    destination_region  = "us-west-2"
    storage_class       = "STANDARD_IA"
    replica_kms_key_id  = aws_kms_key.replica.arn
  }

  backup_settings = {
    retention_days          = 30
    transition_to_glacier   = true
    glacier_transition_days = 90
  }
}

# AI Infrastructure Module
module "ai" {
  source = "../../modules/ai"

  environment          = local.environment
  project_name         = local.project_name
  aws_region          = local.aws_region
  google_project_id   = local.google_project_id
  
  face_detection_confidence = 98
  max_faces_per_image      = 20
  ai_failover_timeout      = 30
  enable_ai_monitoring     = true

  tags = {
    Component = "AI"
  }
}

# CloudWatch Alarms for Production Monitoring
resource "aws_cloudwatch_metric_alarm" "api_latency" {
  alarm_name          = "prod-api-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Latency"
  namespace           = "AWS/ApiGateway"
  period              = 300
  statistic           = "Average"
  threshold           = local.monitoring_config.latency_threshold
  alarm_description   = "API latency exceeds threshold"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# Backup Plan for Production Data
resource "aws_backup_plan" "prod_backup" {
  name = "prod-backup-plan"

  rule {
    rule_name         = "prod_backup_rule"
    target_vault_name = aws_backup_vault.prod.name
    schedule          = "cron(0 5 ? * * *)"
    
    lifecycle {
      cold_storage_after = 30
      delete_after       = 90
    }

    copy_action {
      destination_vault_arn = aws_backup_vault.dr.arn
    }
  }
}

# SNS Topic for Production Alerts
resource "aws_sns_topic" "alerts" {
  name = "prod-alerts"
  
  tags = {
    Environment = local.environment
    Purpose     = "Production Monitoring"
  }
}

# KMS Key for Cross-Region Replication
resource "aws_kms_key" "replica" {
  description             = "KMS key for cross-region replication"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  multi_region           = true

  tags = {
    Environment = local.environment
    Purpose     = "Data Replication"
  }
}