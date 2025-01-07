# Provider configurations
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    datadog = {
      source  = "DataDog/datadog"
      version = "~> 3.0"
    }
  }
}

# Get current AWS region
data "aws_region" "current" {}

# Configure DataDog provider
provider "datadog" {
  api_key = var.datadog_api_key
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "application_logs" {
  name              = "/aws/memoryreel/${var.environment}/application"
  retention_in_days = var.log_retention_days

  tags = {
    Environment = var.environment
    Project     = "memoryreel"
    Type        = "application"
  }
}

resource "aws_cloudwatch_log_group" "api_logs" {
  name              = "/aws/memoryreel/${var.environment}/api"
  retention_in_days = var.log_retention_days

  tags = {
    Environment = var.environment
    Project     = "memoryreel"
    Type        = "api"
  }
}

# CloudWatch Metric Alarms
resource "aws_cloudwatch_metric_alarm" "api_errors" {
  alarm_name          = "memoryreel-${var.environment}-api-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name        = "5XXError"
  namespace          = "AWS/ApiGateway"
  period             = 300
  statistic          = "Sum"
  threshold          = var.metric_alarm_thresholds.api_error_count
  alarm_description  = "API error rate exceeded threshold"
  alarm_actions      = var.alert_endpoints

  dimensions = {
    Environment = var.environment
  }

  tags = {
    Environment = var.environment
    Project     = "memoryreel"
  }
}

resource "aws_cloudwatch_metric_alarm" "api_latency" {
  alarm_name          = "memoryreel-${var.environment}-api-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name        = "Latency"
  namespace          = "AWS/ApiGateway"
  period             = 60
  statistic          = "Average"
  threshold          = var.metric_alarm_thresholds.api_latency_ms
  alarm_description  = "API latency exceeded SLA threshold"
  alarm_actions      = var.alert_endpoints

  dimensions = {
    Environment = var.environment
  }

  tags = {
    Environment = var.environment
    Project     = "memoryreel"
  }
}

# DataDog Monitors
resource "datadog_monitor" "api_response_time" {
  name    = "MemoryReel API Response Time"
  type    = "metric alert"
  message = "API response time exceeded critical threshold. Please investigate immediately. @${join(" @", var.alert_endpoints)}"
  
  query = "avg(last_5m):avg:aws.apigateway.latency{env:${var.environment}} > ${var.datadog_monitor_thresholds.api_response_time_critical}"

  thresholds = {
    critical = var.datadog_monitor_thresholds.api_response_time_critical
    warning  = var.datadog_monitor_thresholds.api_response_time_warning
  }

  notify_no_data    = true
  require_full_window = false
  include_tags      = true

  tags = [
    "env:${var.environment}",
    "project:memoryreel",
    "service:api"
  ]
}

resource "datadog_monitor" "memory_utilization" {
  name    = "MemoryReel Memory Utilization"
  type    = "metric alert"
  message = "Container memory utilization exceeded critical threshold. @${join(" @", var.alert_endpoints)}"
  
  query = "avg(last_5m):avg:aws.ecs.memory_utilization{env:${var.environment}} > ${var.datadog_monitor_thresholds.memory_utilization_critical}"

  thresholds = {
    critical = var.datadog_monitor_thresholds.memory_utilization_critical
    warning  = var.datadog_monitor_thresholds.memory_utilization_warning
  }

  notify_no_data    = true
  require_full_window = false
  include_tags      = true

  tags = [
    "env:${var.environment}",
    "project:memoryreel",
    "service:container"
  ]
}

# Outputs for other modules
output "application_log_group_name" {
  value       = aws_cloudwatch_log_group.application_logs.name
  description = "Name of the application CloudWatch log group"
}

output "api_log_group_name" {
  value       = aws_cloudwatch_log_group.api_logs.name
  description = "Name of the API CloudWatch log group"
}

output "application_log_group_arn" {
  value       = aws_cloudwatch_log_group.application_logs.arn
  description = "ARN of the application CloudWatch log group"
}

output "api_log_group_arn" {
  value       = aws_cloudwatch_log_group.api_logs.arn
  description = "ARN of the API CloudWatch log group"
}

output "datadog_monitors" {
  value = {
    api_response_time = {
      id   = datadog_monitor.api_response_time.id
      name = datadog_monitor.api_response_time.name
    }
    memory_utilization = {
      id   = datadog_monitor.memory_utilization.id
      name = datadog_monitor.memory_utilization.name
    }
  }
  description = "DataDog monitor details for reference"
}