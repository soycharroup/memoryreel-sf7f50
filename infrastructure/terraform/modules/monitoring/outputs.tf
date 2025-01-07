# CloudWatch Log Group ARN output for centralized logging
output "cloudwatch_log_group_arn" {
  description = "ARN of the CloudWatch log group for centralized application logging and monitoring"
  value       = aws_cloudwatch_log_group.application_logs.arn
}

# Map of CloudWatch alarm ARNs for metric monitoring
output "cloudwatch_alarms" {
  description = "Map of CloudWatch alarm ARNs for comprehensive metric monitoring and alerting"
  value = {
    api_errors         = aws_cloudwatch_metric_alarm.api_errors.arn
    api_latency        = aws_cloudwatch_metric_alarm.api_latency.arn
    memory_utilization = aws_cloudwatch_metric_alarm.memory_utilization.arn
    cpu_utilization    = aws_cloudwatch_metric_alarm.cpu_utilization.arn
    storage_usage      = aws_cloudwatch_metric_alarm.storage_usage.arn
    concurrent_users   = aws_cloudwatch_metric_alarm.concurrent_users.arn
  }
}

# Map of DataDog monitor IDs for external monitoring
output "datadog_monitor_ids" {
  description = "Map of DataDog monitor IDs for external monitoring and advanced analytics"
  value = {
    api_response_time = datadog_monitor.api_response_time.id
    error_rate        = datadog_monitor.error_rate.id
    user_experience   = datadog_monitor.user_experience.id
    system_health     = datadog_monitor.system_health.id
  }
}

# Application log group name for easy reference
output "application_log_group_name" {
  description = "Name of the CloudWatch log group for application logs"
  value       = aws_cloudwatch_log_group.application_logs.name
}

# API log group name for easy reference
output "api_log_group_name" {
  description = "Name of the CloudWatch log group for API logs"
  value       = aws_cloudwatch_log_group.api_logs.name
}

# DataDog monitor details with additional metadata
output "datadog_monitors" {
  description = "Detailed information about DataDog monitors including names and IDs"
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
}