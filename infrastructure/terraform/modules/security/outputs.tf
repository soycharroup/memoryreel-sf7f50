# ECS Task Role ARN output
output "task_role_arn" {
  value       = aws_iam_role.ecs_task_role.arn
  description = "ARN of the IAM role used by ECS tasks with least privilege access permissions"
}

# ECS Execution Role ARN output
output "execution_role_arn" {
  value       = aws_iam_role.ecs_execution_role.arn
  description = "ARN of the IAM role used for ECS task execution with container deployment permissions"
}

# KMS Key ARN output
output "kms_key_arn" {
  value       = aws_kms_key.app_key.arn
  description = "ARN of the KMS key used for AES-256 data encryption across services"
}

# KMS Key ID output
output "kms_key_id" {
  value       = aws_kms_key.app_key.key_id
  description = "ID of the KMS key used for encryption key management and automatic rotation"
}

# WAF Web ACL ARN output
output "waf_acl_arn" {
  value       = aws_wafv2_web_acl.app_waf.arn
  description = "ARN of the WAF web ACL used for application protection and threat mitigation"
}

# Security Group ID output
output "app_security_group_id" {
  value       = aws_security_group.app_sg.id
  description = "ID of the security group used for network isolation and access control"
}