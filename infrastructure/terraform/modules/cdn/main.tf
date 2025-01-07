# AWS Provider configuration with version constraint
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# CloudFront Origin Access Identity for S3 bucket access
resource "aws_cloudfront_origin_access_identity" "oai" {
  comment = "OAI for ${var.environment} media access"
}

# CloudFront Response Headers Policy for security
resource "aws_cloudfront_response_headers_policy" "security_headers" {
  name = "${var.environment}-security-headers"
  
  security_headers_config {
    strict_transport_security {
      override = true
      max_age_sec = 31536000 # 1 year
      include_subdomains = true
      preload = true
    }
    
    content_security_policy {
      override = true
      content_security_policy = "default-src 'self' https:; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; object-src 'none'"
    }
    
    x_frame_options {
      override = true
      frame_option = "DENY"
    }
    
    x_content_type_options {
      override = true
    }
    
    x_xss_protection {
      override = true
      protection = true
      mode_block = true
    }
    
    referrer_policy {
      override = true
      referrer_policy = "strict-origin-when-cross-origin"
    }
  }
}

# S3 bucket for CloudFront access logs
resource "aws_s3_bucket" "logs" {
  bucket = "${var.environment}-cdn-logs-${random_id.suffix.hex}"
  force_destroy = var.environment != "prod"
}

resource "random_id" "suffix" {
  byte_length = 4
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "cdn" {
  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http3"
  price_class         = var.price_class
  web_acl_id          = var.waf_web_acl_id
  aliases             = [var.domain_name]
  default_root_object = "index.html"
  
  # Origin configuration for S3
  origin {
    domain_name = data.aws_s3_bucket.media.bucket_regional_domain_name
    origin_id   = "S3-${var.environment}-media"
    
    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.oai.cloudfront_access_identity_path
    }
    
    origin_shield {
      enabled = true
      origin_shield_region = "us-east-1"
    }
  }
  
  # Default cache behavior
  default_cache_behavior {
    allowed_methods  = var.allowed_methods
    cached_methods   = var.cached_methods
    target_origin_id = "S3-${var.environment}-media"
    
    forwarded_values {
      query_string = false
      headers      = ["Origin", "Access-Control-Request-Headers", "Access-Control-Request-Method"]
      
      cookies {
        forward = "none"
      }
    }
    
    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = var.min_ttl
    default_ttl            = var.default_ttl
    max_ttl                = var.max_ttl
    compress               = true
    
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security_headers.id
  }
  
  # Custom error responses
  custom_error_response {
    error_code         = 403
    response_code      = 404
    response_page_path = "/404.html"
  }
  
  custom_error_response {
    error_code         = 404
    response_code      = 404
    response_page_path = "/404.html"
  }
  
  # SSL/TLS configuration
  viewer_certificate {
    acm_certificate_arn      = var.ssl_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
  
  # Access logging
  logging_config {
    include_cookies = false
    bucket         = aws_s3_bucket.logs.bucket_domain_name
    prefix         = "cdn/"
  }
  
  # Geo-restriction for initial phase countries
  restrictions {
    geo_restriction {
      restriction_type = "whitelist"
      locations        = ["US", "CA", "GB", "DE", "FR", "AU"]
    }
  }
  
  tags = {
    Environment = var.environment
    Name        = "${var.environment}-cdn"
    ManagedBy   = "terraform"
  }
}

# Data source for S3 bucket
data "aws_s3_bucket" "media" {
  bucket = var.bucket_id
}

# Outputs
output "distribution_id" {
  description = "The ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.cdn.id
}

output "distribution_domain_name" {
  description = "The domain name of the CloudFront distribution"
  value       = aws_cloudfront_distribution.cdn.domain_name
}

output "distribution_hosted_zone_id" {
  description = "The CloudFront Route 53 zone ID"
  value       = aws_cloudfront_distribution.cdn.hosted_zone_id
}

output "response_headers_policy_id" {
  description = "The ID of the CloudFront response headers policy"
  value       = aws_cloudfront_response_headers_policy.security_headers.id
}