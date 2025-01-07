# MongoDB Atlas configuration variables
variable "mongodb_project_id" {
  description = "MongoDB Atlas project ID"
  type        = string
  
  validation {
    condition     = length(var.mongodb_project_id) > 0
    error_message = "MongoDB Atlas project ID cannot be empty"
  }
}

variable "mongodb_cluster_name" {
  description = "Name of the MongoDB Atlas cluster"
  type        = string
  default     = "memoryreel-metadata"
}

variable "mongodb_instance_size" {
  description = "Instance size for MongoDB Atlas cluster nodes"
  type        = string
  default     = "M30"
}

variable "mongodb_region" {
  description = "AWS region for MongoDB Atlas cluster deployment"
  type        = string
  default     = "US_EAST_1"
}

variable "mongodb_auto_scaling_enabled" {
  description = "Enable auto-scaling for MongoDB Atlas cluster"
  type        = bool
  default     = true
}

variable "mongodb_backup_enabled" {
  description = "Enable continuous backup for MongoDB Atlas cluster"
  type        = bool
  default     = true
}

# Redis cluster configuration variables
variable "redis_cluster_name" {
  description = "Name of the Redis cluster"
  type        = string
  default     = "memoryreel-cache"
}

variable "redis_node_type" {
  description = "Instance type for Redis nodes"
  type        = string
  default     = "cache.r6g.large"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes in the Redis cluster"
  type        = number
  default     = 3
  
  validation {
    condition     = var.redis_num_cache_nodes >= 2
    error_message = "Redis cluster must have at least 2 nodes for high availability"
  }
}

variable "redis_automatic_failover_enabled" {
  description = "Enable automatic failover for Redis cluster"
  type        = bool
  default     = true
}

variable "redis_multi_az_enabled" {
  description = "Enable Multi-AZ deployment for Redis cluster"
  type        = bool
  default     = true
}

# Network configuration variables
variable "vpc_id" {
  description = "VPC ID where Redis cluster will be deployed"
  type        = string
  
  validation {
    condition     = length(var.vpc_id) > 0
    error_message = "VPC ID cannot be empty"
  }
}

variable "subnet_ids" {
  description = "List of subnet IDs for Redis cluster deployment"
  type        = list(string)
  
  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "At least two subnet IDs are required for Redis cluster"
  }
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to access Redis cluster"
  type        = list(string)
  default     = []
}

# Performance and scaling variables
variable "mongodb_sharding_enabled" {
  description = "Enable sharding for MongoDB Atlas cluster"
  type        = bool
  default     = true
}

variable "mongodb_replication_factor" {
  description = "Replication factor for MongoDB Atlas cluster"
  type        = number
  default     = 3
  
  validation {
    condition     = var.mongodb_replication_factor >= 3
    error_message = "Replication factor must be at least 3 for high availability"
  }
}

variable "redis_parameter_group_family" {
  description = "Redis parameter group family"
  type        = string
  default     = "redis6.x"
}

variable "redis_snapshot_retention_limit" {
  description = "Number of days to retain Redis snapshots"
  type        = number
  default     = 7
  
  validation {
    condition     = var.redis_snapshot_retention_limit >= 1
    error_message = "Snapshot retention limit must be at least 1 day"
  }
}