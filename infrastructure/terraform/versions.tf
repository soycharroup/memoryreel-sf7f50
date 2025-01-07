terraform {
  # Terraform version constraint requiring 1.5.0 or higher for latest features and security updates
  required_version = ">= 1.5.0"

  # Required provider configurations with specific version constraints
  required_providers {
    # AWS provider for primary infrastructure including ECS, S3, CloudFront, and core services
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"  # Allows 5.x updates but prevents breaking changes
    }

    # MongoDB Atlas provider for managed database infrastructure
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.0"  # Stable version for production database management
    }

    # Google Cloud provider for AI services failover and redundancy
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"  # Compatible version for AI service integration
    }
  }
}