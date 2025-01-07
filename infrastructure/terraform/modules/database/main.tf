# Required providers configuration
terraform {
  required_providers {
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.0"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# MongoDB Atlas Cluster Configuration
resource "mongodbatlas_cluster" "main" {
  project_id = var.mongodb_project_id
  name       = var.mongodb_cluster_name

  # Cluster configuration
  cluster_type = "REPLICASET"
  mongo_db_major_version = "6.0"

  # Replication configuration
  replication_specs {
    num_shards = var.mongodb_sharding_enabled ? 2 : 1
    regions_config {
      region_name     = var.mongodb_region
      electable_nodes = var.mongodb_replication_factor
      priority        = 7
      read_only_nodes = 1
    }
  }

  # Provider settings
  provider_name               = "AWS"
  provider_instance_size_name = var.mongodb_instance_size
  
  # Auto-scaling configuration
  auto_scaling_compute_enabled            = var.mongodb_auto_scaling_enabled
  auto_scaling_compute_scale_down_enabled = var.mongodb_auto_scaling_enabled

  # Backup configuration
  backup_enabled = var.mongodb_backup_enabled
  pit_enabled    = var.mongodb_backup_enabled

  # Advanced configuration
  advanced_configuration {
    javascript_enabled              = false
    minimum_enabled_tls_protocol   = "TLS1_2"
    no_table_scan                  = false
    oplog_size_mb                  = 2048
    sample_size_bi_connector       = 5000
    sample_refresh_interval_bi_connector = 300
  }
}

# Redis Subnet Group
resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.redis_cluster_name}-subnet-group"
  subnet_ids = var.subnet_ids

  tags = {
    Name        = "${var.redis_cluster_name}-subnet-group"
    Environment = var.environment
    Project     = "MemoryReel"
    ManagedBy   = "Terraform"
  }
}

# Redis Security Group
resource "aws_security_group" "redis" {
  name        = "${var.redis_cluster_name}-sg"
  description = "Security group for Redis cluster"
  vpc_id      = var.vpc_id

  ingress {
    from_port        = 6379
    to_port          = 6379
    protocol         = "tcp"
    cidr_blocks      = var.allowed_cidr_blocks
    description      = "Redis access from application subnets"
  }

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    description      = "Allow all outbound traffic"
  }

  tags = {
    Name        = "${var.redis_cluster_name}-sg"
    Environment = var.environment
    Project     = "MemoryReel"
    ManagedBy   = "Terraform"
  }
}

# Redis Replication Group
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id          = var.redis_cluster_name
  replication_group_description = "Redis cluster for MemoryReel caching"
  node_type                     = var.redis_node_type
  port                          = 6379
  parameter_group_family        = var.redis_parameter_group_family
  automatic_failover_enabled    = var.redis_automatic_failover_enabled
  multi_az_enabled             = var.redis_multi_az_enabled
  number_cache_clusters        = var.redis_num_cache_nodes
  subnet_group_name            = aws_elasticache_subnet_group.redis.name
  security_group_ids           = [aws_security_group.redis.id]

  # Enhanced security configuration
  at_rest_encryption_enabled   = true
  transit_encryption_enabled   = true
  auth_token                  = var.redis_auth_token
  
  # Maintenance and backup configuration
  maintenance_window          = "sun:05:00-sun:09:00"
  snapshot_window            = "00:00-05:00"
  snapshot_retention_limit   = var.redis_snapshot_retention_limit
  auto_minor_version_upgrade = true

  tags = {
    Name        = var.redis_cluster_name
    Environment = var.environment
    Project     = "MemoryReel"
    ManagedBy   = "Terraform"
  }
}

# Outputs
output "mongodb_cluster_id" {
  description = "ID of the MongoDB Atlas cluster"
  value       = mongodbatlas_cluster.main.cluster_id
}

output "mongodb_connection_string" {
  description = "Connection string for MongoDB Atlas cluster"
  value       = mongodbatlas_cluster.main.connection_strings[0].standard
  sensitive   = true
}

output "mongodb_srv_address" {
  description = "SRV connection string for MongoDB Atlas cluster"
  value       = mongodbatlas_cluster.main.connection_strings[0].standard_srv
  sensitive   = true
}

output "redis_cluster_id" {
  description = "ID of the Redis replication group"
  value       = aws_elasticache_replication_group.redis.id
}

output "redis_configuration_endpoint" {
  description = "Configuration endpoint for Redis cluster"
  value       = aws_elasticache_replication_group.redis.configuration_endpoint_address
}

output "redis_cache_nodes" {
  description = "List of Redis cache nodes"
  value       = aws_elasticache_replication_group.redis.cache_nodes
}