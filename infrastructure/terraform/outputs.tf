# Root outputs configuration file for MemoryReel platform
# Aggregates essential infrastructure resource attributes from all modules

# API Infrastructure Outputs
output "api_endpoint" {
  description = "DNS name of the API load balancer for backend services with health check path"
  value       = module.api.alb_dns_name
  sensitive   = false
}

# Content Delivery Configuration
output "content_delivery_configuration" {
  description = "Comprehensive CDN and storage configuration for media delivery"
  value = {
    cdn_domain     = module.storage.cdn_domain_name
    distribution_id = module.storage.cdn_id
    origin_bucket  = module.storage.bucket_regional_domain_name
    bucket_id      = module.storage.bucket_id
  }
  sensitive = false
}

# AI Service Configuration
output "ai_configuration" {
  description = "Consolidated AI service configuration for multi-provider processing"
  value = {
    rekognition = {
      collection_id = module.ai.rekognition_collection_id
      region       = var.aws_region
    }
    openai     = module.ai.openai_configuration
    google_ai  = module.ai.google_ai_config
    service_endpoints = module.ai.ai_service_endpoints
  }
  sensitive = false
}

# Service Discovery Configuration
output "service_discovery" {
  description = "Service discovery and networking configuration"
  value = {
    ecs_cluster_id = module.api.ecs_cluster_id
    namespace      = module.api.service_discovery_namespace
    security_group = module.api.api_security_group
  }
  sensitive = false
}

# Environment Information
output "environment_info" {
  description = "Comprehensive environment information for cross-module reference"
  value = {
    project_name = var.project_name
    environment  = var.environment
    region      = var.aws_region
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
  sensitive = false
}