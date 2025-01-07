# S3 bucket outputs
output "bucket_id" {
  description = "ID of the created S3 bucket for media storage, used for resource references and access configuration"
  value       = aws_s3_bucket.media_storage.id
  sensitive   = false
}

output "bucket_arn" {
  description = "ARN of the created S3 bucket, required for IAM policy definitions and cross-account access"
  value       = aws_s3_bucket.media_storage.arn
  sensitive   = false
}

output "bucket_domain_name" {
  description = "Domain name of the S3 bucket for direct access, useful for development and testing scenarios"
  value       = aws_s3_bucket.media_storage.bucket_domain_name
  sensitive   = false
}

output "bucket_regional_domain_name" {
  description = "Regional domain name of the S3 bucket, optimized for same-region access patterns"
  value       = aws_s3_bucket.media_storage.bucket_regional_domain_name
  sensitive   = false
}

# CloudFront CDN outputs
output "cdn_id" {
  description = "ID of the CloudFront distribution, used for distribution management and updates"
  value       = aws_cloudfront_distribution.media_cdn.id
  sensitive   = false
}

output "cdn_arn" {
  description = "ARN of the CloudFront distribution, required for IAM policies and cross-account access"
  value       = aws_cloudfront_distribution.media_cdn.arn
  sensitive   = false
}

output "cdn_domain_name" {
  description = "Domain name of the CloudFront distribution for content delivery, primary endpoint for media access"
  value       = aws_cloudfront_distribution.media_cdn.domain_name
  sensitive   = false
}