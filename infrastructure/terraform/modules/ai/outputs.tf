# AWS Rekognition Collection outputs
output "rekognition_collection_id" {
  description = "ID of the AWS Rekognition collection for face detection"
  value       = aws_rekognition_collection.faces.id
}

output "rekognition_collection_arn" {
  description = "ARN of the AWS Rekognition collection"
  value       = aws_rekognition_collection.faces.arn
}

# Google Vision AI outputs
output "vision_ai_service_name" {
  description = "Enabled Google Vision AI service name"
  value       = google_project_service.vision_ai.service
}

output "vision_ai_project" {
  description = "Google Cloud project ID where Vision AI is enabled"
  value       = google_project_service.vision_ai.project
}

# AI Service endpoints configuration
output "ai_service_endpoints" {
  description = "Map of AI service endpoints for the application with region-specific configurations"
  value = {
    rekognition = "rekognition.${data.aws_region.current.name}.amazonaws.com"
    vision_ai   = "vision.googleapis.com"
    openai      = "api.openai.com"
  }
}

# Comprehensive monitoring configuration
output "ai_monitoring_config" {
  description = "Comprehensive AI service monitoring configuration including performance thresholds"
  value = {
    log_group = "/aws/ai/${var.project_name}-${var.environment}"
    enable_monitoring = local.ai_config.enable_monitoring
    face_detection_confidence = local.ai_config.face_detection_confidence

    # Performance monitoring thresholds
    performance_thresholds = {
      response_time_ms = 2000  # Maximum acceptable response time
      success_rate     = 0.98  # Required 98% success rate
      error_threshold  = 0.02  # Maximum acceptable error rate
    }

    # Failover configuration
    failover_config = {
      retry_attempts = 3
      backoff_ms    = 1000
      provider_priority = [
        "openai",      # Primary provider
        "rekognition", # Secondary provider
        "vision_ai"    # Tertiary provider
      ]
    }
  }
}