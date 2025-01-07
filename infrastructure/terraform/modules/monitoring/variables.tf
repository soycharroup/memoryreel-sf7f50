# Environment variable for deployment context
variable "environment" {
  type        = string
  description = "Deployment environment identifier for monitoring context (dev, staging, prod)"
  
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

# DataDog API key for secure integration
variable "datadog_api_key" {
  type        = string
  description = "DataDog API key for monitoring integration and metrics collection"
  sensitive   = true
}

# Alert notification endpoints
variable "alert_endpoints" {
  type        = list(string)
  description = "List of email addresses to receive monitoring alerts and notifications"
  
  validation {
    condition     = length(var.alert_endpoints) > 0
    error_message = "At least one alert endpoint must be provided"
  }
}

# CloudWatch log retention configuration
variable "log_retention_days" {
  type        = number
  description = "Number of days to retain CloudWatch logs for system monitoring"
  default     = 30
  
  validation {
    condition     = var.log_retention_days >= 1 && var.log_retention_days <= 365
    error_message = "Log retention must be between 1 and 365 days"
  }
}

# CloudWatch metric alarm thresholds
variable "metric_alarm_thresholds" {
  type = object({
    api_error_count    = number
    api_latency_ms    = number
    memory_utilization = number
    cpu_utilization   = number
  })
  
  description = "Threshold configurations for CloudWatch metric alarms"
  
  default = {
    api_error_count    = 10
    api_latency_ms    = 2000
    memory_utilization = 80
    cpu_utilization   = 75
  }
}

# DataDog monitor thresholds
variable "datadog_monitor_thresholds" {
  type = object({
    api_response_time_critical = number
    api_response_time_warning = number
    error_rate_critical      = number
    error_rate_warning       = number
  })
  
  description = "Threshold configurations for DataDog performance monitors"
  
  default = {
    api_response_time_critical = 2000
    api_response_time_warning  = 1000
    error_rate_critical       = 5
    error_rate_warning        = 3
  }
}