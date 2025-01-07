# Output definitions for the MemoryReel API infrastructure module
# Exposes essential resource identifiers and configuration values for cross-module integration

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer for API services, used for service discovery and DNS configuration"
  value       = aws_lb.api.dns_name
}

output "alb_arn" {
  description = "ARN of the Application Load Balancer, used for CloudWatch dashboard integration and metric collection"
  value       = aws_lb.api.arn
}

output "ecs_cluster_id" {
  description = "ID of the ECS cluster running API services, used for task deployment and service configuration"
  value       = aws_ecs_cluster.main.id
}

output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster, used for IAM policies and CloudWatch metric collection"
  value       = aws_ecs_cluster.main.arn
}

output "api_security_group_id" {
  description = "ID of the security group attached to API containers, used for network security configuration"
  value       = aws_security_group.api.id
}