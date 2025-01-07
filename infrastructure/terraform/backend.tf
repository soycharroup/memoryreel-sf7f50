# Backend configuration for MemoryReel infrastructure state management
# Version: ~> 5.0 (AWS Provider)

terraform {
  backend "s3" {
    # S3 bucket for state storage with environment-specific naming
    bucket = "memoryreel-terraform-state-${var.environment}"
    
    # State file path within bucket
    key = "terraform.tfstate"
    
    # AWS region for state storage
    region = "${var.aws_region}"
    
    # Enable encryption at rest using AWS KMS
    encrypt = true
    
    # DynamoDB table for state locking
    dynamodb_table = "memoryreel-terraform-locks-${var.environment}"
    
    # Enable versioning for state file history
    versioning = true
    
    # Additional security and performance settings
    server_side_encryption_configuration {
      rule {
        apply_server_side_encryption_by_default {
          sse_algorithm = "aws:kms"
        }
      }
    }
    
    # Lifecycle rules for state management
    lifecycle_rule {
      enabled = true
      
      noncurrent_version_transition {
        days          = 30
        storage_class = "STANDARD_IA"
      }
      
      noncurrent_version_expiration {
        days = 90
      }
    }
    
    # Access logging for audit purposes
    logging {
      target_bucket = "memoryreel-terraform-logs-${var.environment}"
      target_prefix = "state-access-logs/"
    }
  }
}