# Input variables for MemoryReel API infrastructure module
# Configures ECS cluster, load balancer, and associated resources

variable "environment" {
  type        = string
  description = "Deployment environment (dev/staging/prod) for the API infrastructure"
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be dev, staging, or prod"
  }
}

variable "vpc_id" {
  type        = string
  description = "ID of the VPC where API infrastructure will be deployed for network isolation"
  validation {
    condition     = can(regex("^vpc-[a-z0-9]+$", var.vpc_id))
    error_message = "VPC ID must be valid AWS VPC identifier"
  }
}

variable "subnet_ids" {
  type        = list(string)
  description = "List of subnet IDs across multiple AZs for high availability deployment"
  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "At least two subnets required for high availability"
  }
}

variable "api_port" {
  type        = number
  description = "Port number for the API containers to expose endpoints"
  default     = 3000
  validation {
    condition     = var.api_port > 0 && var.api_port < 65536
    error_message = "API port must be between 1 and 65535"
  }
}

variable "api_image" {
  type        = string
  description = "Docker image with tag for API containers following semantic versioning"
  validation {
    condition     = can(regex("^[\\w\\-\\.]+/[\\w\\-\\.]+:\\d+\\.\\d+\\.\\d+$", var.api_image))
    error_message = "API image must follow format repository/image:semantic-version"
  }
}

variable "desired_count" {
  type        = number
  description = "Desired number of API container instances for the service"
  default     = 2
  validation {
    condition     = var.desired_count >= 2
    error_message = "Minimum of 2 instances required for high availability"
  }
}

variable "cpu" {
  type        = number
  description = "CPU units for API containers (1024 = 1 vCPU)"
  default     = 1024
  validation {
    condition     = contains([256, 512, 1024, 2048, 4096], var.cpu)
    error_message = "CPU units must be one of [256, 512, 1024, 2048, 4096]"
  }
}

variable "memory" {
  type        = number
  description = "Memory allocation for API containers in MB"
  default     = 2048
  validation {
    condition     = var.memory >= 512 && var.memory <= 30720
    error_message = "Memory must be between 512MB and 30720MB"
  }
}

variable "health_check_path" {
  type        = string
  description = "Health check endpoint path for API containers monitoring"
  default     = "/health"
  validation {
    condition     = can(regex("^/[\\w\\-/]*$", var.health_check_path))
    error_message = "Health check path must start with / and contain only alphanumeric characters"
  }
}

variable "ecs_execution_role_arn" {
  type        = string
  description = "ARN of the IAM role for ECS task execution"
  validation {
    condition     = can(regex("^arn:aws:iam::[0-9]{12}:role/.+$", var.ecs_execution_role_arn))
    error_message = "Must be a valid IAM role ARN"
  }
}

variable "ecs_task_role_arn" {
  type        = string
  description = "ARN of the IAM role for ECS tasks runtime permissions"
  validation {
    condition     = can(regex("^arn:aws:iam::[0-9]{12}:role/.+$", var.ecs_task_role_arn))
    error_message = "Must be a valid IAM role ARN"
  }
}

variable "tags" {
  type        = map(string)
  description = "Resource tags for API infrastructure cost allocation and organization"
  default     = {}
}