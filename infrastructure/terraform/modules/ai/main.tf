# Provider configuration
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
  required_version = ">= 1.0"
}

# Local variables
locals {
  common_tags = {
    Environment  = var.environment
    Project      = var.project_name
    ManagedBy    = "terraform"
    LastUpdated  = timestamp()
  }

  ai_config = {
    face_detection_confidence = 98
    enable_monitoring        = true
    log_retention_days      = 30
    failover_retry_attempts = 3
    performance_monitoring  = true
  }
}

# AWS Rekognition Collection
resource "aws_rekognition_collection" "faces" {
  collection_id = "${var.project_name}-${var.environment}-faces"

  tags = merge(local.common_tags, {
    MinConfidence = local.ai_config.face_detection_confidence
  })
}

# Google Cloud Vision AI Service
resource "google_project_service" "vision_ai" {
  project = var.google_project_id
  service = "vision.googleapis.com"
  
  disable_on_destroy = false
}

# Service Account for Vision AI
resource "google_service_account" "vision_ai" {
  account_id   = "${var.project_name}-${var.environment}-vision-ai"
  display_name = "Vision AI Service Account"
  project      = var.google_project_id
}

# KMS Key for Log Encryption
resource "aws_kms_key" "log_encryption" {
  description             = "KMS key for AI service log encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  
  tags = local.common_tags
}

# KMS Key Alias
resource "aws_kms_alias" "log_encryption" {
  name          = "alias/${var.project_name}-${var.environment}-ai-logs"
  target_key_id = aws_kms_key.log_encryption.key_id
}

# CloudWatch Log Group for AI Service Monitoring
resource "aws_cloudwatch_log_group" "ai_logs" {
  name              = "/aws/ai/${var.project_name}-${var.environment}"
  retention_in_days = local.ai_config.log_retention_days
  kms_key_id       = aws_kms_key.log_encryption.arn

  tags = local.common_tags
}

# IAM Role for Rekognition
resource "aws_iam_role" "rekognition" {
  name = "${var.project_name}-${var.environment}-rekognition"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "rekognition.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  inline_policy {
    name = "rekognition_permissions"
    policy = jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Effect = "Allow"
          Action = [
            "rekognition:DetectFaces",
            "rekognition:SearchFacesByImage",
            "rekognition:IndexFaces"
          ]
          Resource = "*"
        },
        {
          Effect = "Allow"
          Action = [
            "logs:CreateLogStream",
            "logs:PutLogEvents"
          ]
          Resource = "${aws_cloudwatch_log_group.ai_logs.arn}:*"
        }
      ]
    })
  }

  tags = local.common_tags
}

# CloudWatch Metric Alarm for Face Detection Accuracy
resource "aws_cloudwatch_metric_alarm" "face_detection_accuracy" {
  alarm_name          = "${var.project_name}-${var.environment}-face-detection-accuracy"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "3"
  metric_name        = "FaceDetectionConfidence"
  namespace          = "MemoryReel/AI"
  period             = "300"
  statistic          = "Average"
  threshold          = local.ai_config.face_detection_confidence
  alarm_description  = "Face detection accuracy below threshold"
  
  alarm_actions = [aws_sns_topic.ai_alerts.arn]
  ok_actions    = [aws_sns_topic.ai_alerts.arn]

  tags = local.common_tags
}

# SNS Topic for AI Alerts
resource "aws_sns_topic" "ai_alerts" {
  name = "${var.project_name}-${var.environment}-ai-alerts"
  
  tags = local.common_tags
}

# SNS Topic Policy
resource "aws_sns_topic_policy" "ai_alerts" {
  arn = aws_sns_topic.ai_alerts.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "cloudwatch.amazonaws.com"
        }
        Action = "SNS:Publish"
        Resource = aws_sns_topic.ai_alerts.arn
      }
    ]
  })
}

# Dashboard for AI Service Monitoring
resource "aws_cloudwatch_dashboard" "ai_monitoring" {
  dashboard_name = "${var.project_name}-${var.environment}-ai-monitoring"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          metrics = [
            ["MemoryReel/AI", "FaceDetectionConfidence", "Environment", var.environment],
            ["MemoryReel/AI", "AIProviderLatency", "Environment", var.environment],
            ["MemoryReel/AI", "FailoverCount", "Environment", var.environment]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "AI Service Metrics"
        }
      }
    ]
  })
}