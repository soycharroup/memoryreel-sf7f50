# Core CloudFront distribution outputs
output "distribution_id" {
  description = "ID of the CloudFront distribution for resource references and monitoring configuration"
  value       = aws_cloudfront_distribution.cdn.id
  sensitive   = false
}

output "distribution_domain_name" {
  description = "Domain name of the CloudFront distribution for content access and CNAME setup"
  value       = aws_cloudfront_distribution.cdn.domain_name
  sensitive   = false
}

output "distribution_hosted_zone_id" {
  description = "Route53 zone ID for the CloudFront distribution, used for DNS alias configuration"
  value       = aws_cloudfront_distribution.cdn.hosted_zone_id
  sensitive   = false
}

output "origin_access_identity_arn" {
  description = "ARN of the CloudFront Origin Access Identity for S3 bucket policy configuration"
  value       = aws_cloudfront_origin_access_identity.oai.iam_arn
  sensitive   = false
}