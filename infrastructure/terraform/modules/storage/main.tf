# AWS Provider configuration with version constraint
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# S3 bucket for media storage
resource "aws_s3_bucket" "media_storage" {
  bucket = "${var.project_name}-${var.environment}-media-storage"
  
  # Prevent accidental deletion in production
  force_destroy = var.environment != "prod" ? true : false
  
  # Enable object lock for compliance
  object_lock_enabled = true
  
  tags = {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
    Purpose     = "media-storage"
  }
}

# Enable versioning with MFA delete protection
resource "aws_s3_bucket_versioning" "media_versioning" {
  bucket = aws_s3_bucket.media_storage.id
  versioning_configuration {
    status     = "Enabled"
    mfa_delete = var.environment == "prod" ? "Enabled" : "Disabled"
  }
}

# Configure server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "media_encryption" {
  bucket = aws_s3_bucket.media_storage.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "AES256"
      bucket_key_enabled = true
    }
  }
}

# Configure lifecycle rules for intelligent tiering
resource "aws_s3_bucket_lifecycle_configuration" "media_lifecycle" {
  bucket = aws_s3_bucket.media_storage.id

  rule {
    id     = "media-lifecycle"
    status = "Enabled"

    transition {
      days          = var.lifecycle_rules.transition_days
      storage_class = var.lifecycle_rules.storage_class
    }

    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "GLACIER"
    }

    expiration {
      days = var.lifecycle_rules.expiration_days
    }

    noncurrent_version_expiration {
      noncurrent_days = var.lifecycle_rules.noncurrent_version_expiration
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# Configure CORS rules
resource "aws_s3_bucket_cors_configuration" "media_cors" {
  bucket = aws_s3_bucket.media_storage.id

  dynamic "cors_rule" {
    for_each = var.cors_rules
    content {
      allowed_headers = cors_rule.value.allowed_headers
      allowed_methods = cors_rule.value.allowed_methods
      allowed_origins = cors_rule.value.allowed_origins
      expose_headers  = cors_rule.value.expose_headers
      max_age_seconds = cors_rule.value.max_age_seconds
    }
  }
}

# Create CloudFront OAI for secure S3 access
resource "aws_cloudfront_origin_access_identity" "media_oai" {
  comment = "OAI for ${var.project_name} media storage"
}

# S3 bucket policy for CloudFront access
resource "aws_s3_bucket_policy" "media_policy" {
  bucket = aws_s3_bucket.media_storage.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "CloudFrontAccess"
        Effect    = "Allow"
        Principal = {
          AWS = "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity ${aws_cloudfront_origin_access_identity.media_oai.id}"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.media_storage.arn}/*"
      }
    ]
  })
}

# CloudFront distribution for content delivery
resource "aws_cloudfront_distribution" "media_cdn" {
  origin {
    domain_name = aws_s3_bucket.media_storage.bucket_regional_domain_name
    origin_id   = "S3-${aws_s3_bucket.media_storage.id}"
    
    origin_shield {
      enabled              = true
      origin_shield_region = "us-east-1"
    }

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.media_oai.cloudfront_access_identity_path
    }
  }

  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  price_class         = var.cdn_settings.price_class
  default_root_object = "index.html"

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD", "OPTIONS"]
    target_origin_id = "S3-${aws_s3_bucket.media_storage.id}"
    compress         = var.cdn_settings.compress

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = var.cdn_settings.viewer_protocol_policy
    min_ttl                = var.cdn_settings.min_ttl
    default_ttl            = var.cdn_settings.default_ttl
    max_ttl                = var.cdn_settings.max_ttl
  }

  # Custom error response for better UX
  custom_error_response {
    error_code         = 403
    response_code      = 404
    response_page_path = "/404.html"
  }

  # Geo-restriction configuration
  restrictions {
    geo_restriction {
      restriction_type = length(var.cdn_settings.geo_restrictions) > 0 ? "whitelist" : "none"
      locations        = length(var.cdn_settings.geo_restrictions) > 0 ? var.cdn_settings.geo_restrictions : []
    }
  }

  # SSL configuration
  viewer_certificate {
    cloudfront_default_certificate = true
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }
}

# Outputs for other modules
output "bucket_id" {
  value       = aws_s3_bucket.media_storage.id
  description = "The ID of the S3 bucket"
}

output "bucket_arn" {
  value       = aws_s3_bucket.media_storage.arn
  description = "The ARN of the S3 bucket"
}

output "bucket_domain_name" {
  value       = aws_s3_bucket.media_storage.bucket_domain_name
  description = "The domain name of the S3 bucket"
}

output "cdn_domain_name" {
  value       = aws_cloudfront_distribution.media_cdn.domain_name
  description = "The domain name of the CloudFront distribution"
}

output "cdn_id" {
  value       = aws_cloudfront_distribution.media_cdn.id
  description = "The ID of the CloudFront distribution"
}

output "cdn_arn" {
  value       = aws_cloudfront_distribution.media_cdn.arn
  description = "The ARN of the CloudFront distribution"
}