# Provider configuration for MemoryReel platform infrastructure
# Version: 1.0.0

# Configure required providers with version constraints
terraform {
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

# Primary AWS provider configuration for main region
provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = var.tags
  }
  
  alias = "primary"
  
  assume_role {
    role_arn     = var.aws_role_arn
    session_name = "memoryreel-${var.environment}"
  }
  
  allowed_account_ids = [var.aws_account_id]
}

# Secondary AWS provider configuration for disaster recovery region
provider "aws" {
  region = var.dr_region
  
  default_tags {
    tags = var.tags
  }
  
  alias = "dr"
  
  assume_role {
    role_arn     = var.aws_dr_role_arn
    session_name = "memoryreel-dr-${var.environment}"
  }
  
  allowed_account_ids = [var.aws_dr_account_id]
}

# MongoDB Atlas provider configuration for database infrastructure
provider "mongodbatlas" {
  public_key  = var.mongodb_public_key
  private_key = var.mongodb_private_key
  
  # Organization and project level access
  project_id = var.mongodb_project_id
  org_id     = var.mongodb_org_id
}

# Google Cloud provider configuration for AI services failover
provider "google" {
  project     = var.google_project_id
  region      = var.google_region
  credentials = var.google_credentials
  zone        = var.google_zone
  
  labels = var.google_labels
}