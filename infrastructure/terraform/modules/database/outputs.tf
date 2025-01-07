# MongoDB Atlas cluster outputs
output "mongodb_cluster_id" {
  description = "The unique identifier of the MongoDB Atlas cluster"
  value       = mongodbatlas_cluster.main.cluster_id
  sensitive   = false
}

output "mongodb_connection_string" {
  description = "The standard connection string for MongoDB Atlas cluster with authentication credentials"
  value       = mongodbatlas_cluster.main.connection_strings[0].standard
  sensitive   = true
}

output "mongodb_connection_string_srv" {
  description = "The SRV connection string for MongoDB Atlas cluster with DNS seedlist and authentication"
  value       = mongodbatlas_cluster.main.connection_strings[0].standard_srv
  sensitive   = true
}

output "mongodb_cluster_state" {
  description = "The current state of the MongoDB Atlas cluster for monitoring"
  value       = mongodbatlas_cluster.main.state_name
  sensitive   = false
}

# Redis cluster outputs
output "redis_cluster_id" {
  description = "The unique identifier of the Redis replication group"
  value       = aws_elasticache_replication_group.redis.id
  sensitive   = false
}

output "redis_primary_endpoint" {
  description = "The endpoint URL for Redis primary node for write operations"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
  sensitive   = false
}

output "redis_reader_endpoint" {
  description = "The endpoint URL for Redis reader nodes for read operations"
  value       = aws_elasticache_replication_group.redis.reader_endpoint_address
  sensitive   = false
}

output "redis_configuration_endpoint" {
  description = "The configuration endpoint for Redis cluster management"
  value       = aws_elasticache_replication_group.redis.configuration_endpoint_address
  sensitive   = false
}