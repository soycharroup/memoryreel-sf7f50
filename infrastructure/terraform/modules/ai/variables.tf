# Core project variables
variable "project_name" {
  type        = string
  description = "Name of the MemoryReel project"
  default     = "memoryreel"
}

variable "environment" {
  type        = string
  description = "Deployment environment (dev, staging, prod)"
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be dev, staging, or prod."
  }
}

# AWS Configuration
variable "aws_region" {
  type        = string
  description = "AWS region for Rekognition service deployment"
  default     = "us-east-1"
}

variable "rekognition_collection_name" {
  type        = string
  description = "Name of the AWS Rekognition collection for face detection"
  default     = "memoryreel-faces"
}

# OpenAI Configuration
variable "openai_api_key" {
  type        = string
  description = "OpenAI API key for primary AI processing"
  sensitive   = true
}

# Google Cloud Configuration
variable "google_project_id" {
  type        = string
  description = "Google Cloud project ID for Vision AI service"
}

variable "vision_ai_location" {
  type        = string
  description = "Google Cloud region for Vision AI service"
  default     = "us-east1"
}

# AI Processing Parameters
variable "face_detection_confidence" {
  type        = number
  description = "Minimum confidence threshold for face detection (0-100)"
  default     = 98

  validation {
    condition     = var.face_detection_confidence >= 0 && var.face_detection_confidence <= 100
    error_message = "Face detection confidence must be between 0 and 100."
  }
}

variable "max_faces_per_image" {
  type        = number
  description = "Maximum number of faces to detect per image"
  default     = 20

  validation {
    condition     = var.max_faces_per_image > 0 && var.max_faces_per_image <= 100
    error_message = "Maximum faces per image must be between 1 and 100."
  }
}

# Failover Configuration
variable "ai_failover_timeout" {
  type        = number
  description = "Timeout in seconds before failing over to secondary AI provider"
  default     = 30

  validation {
    condition     = var.ai_failover_timeout >= 5 && var.ai_failover_timeout <= 300
    error_message = "Failover timeout must be between 5 and 300 seconds."
  }
}

# Monitoring Configuration
variable "enable_ai_monitoring" {
  type        = bool
  description = "Enable CloudWatch monitoring for AI services"
  default     = true
}

# Tags
variable "tags" {
  type        = map(string)
  description = "Additional tags for AI resources"
  default     = {}
}