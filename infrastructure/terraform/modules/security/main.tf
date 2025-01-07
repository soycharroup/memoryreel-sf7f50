# AWS Provider configuration with version constraint
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for resource naming and tagging
locals {
  name_prefix = "memoryreel-${var.environment}"
  common_tags = {
    Environment = var.environment
    ManagedBy   = "Terraform"
    Project     = "MemoryReel"
  }
}

# KMS key for data encryption
resource "aws_kms_key" "app_key" {
  description             = "KMS key for MemoryReel data encryption"
  deletion_window_in_days = var.key_deletion_window
  enable_key_rotation     = true
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-kms-key"
  })
}

resource "aws_kms_alias" "app_key_alias" {
  name          = "alias/${local.name_prefix}-key"
  target_key_id = aws_kms_key.app_key.key_id
}

# IAM roles for ECS tasks
resource "aws_iam_role" "ecs_task_role" {
  name = "${local.name_prefix}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role" "ecs_execution_role" {
  name = "${local.name_prefix}-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = local.common_tags
}

# IAM policies for ECS roles
resource "aws_iam_role_policy_attachment" "ecs_task_policy" {
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "kms_decrypt" {
  name = "${local.name_prefix}-kms-decrypt"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "kms:Decrypt",
        "kms:GenerateDataKey"
      ]
      Resource = [aws_kms_key.app_key.arn]
    }]
  })
}

resource "aws_iam_role_policy" "s3_access" {
  name = "${local.name_prefix}-s3-access"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket"
      ]
      Resource = [
        "arn:aws:s3:::memoryreel-*/*",
        "arn:aws:s3:::memoryreel-*"
      ]
    }]
  })
}

# WAF Web ACL
resource "aws_wafv2_web_acl" "app_waf" {
  name        = "${local.name_prefix}-waf"
  description = "WAF rules for MemoryReel application"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # Rate limiting rule
  rule {
    name     = "RateLimit"
    priority = 1

    override_action {
      none {}
    }

    statement {
      rate_based_statement {
        limit              = var.waf_rate_limit
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "${local.name_prefix}-rate-limit"
      sampled_requests_enabled  = true
    }
  }

  # AWS Managed Rules
  dynamic "rule" {
    for_each = {
      AWSManagedRulesCommonRuleSet          = "AWS-AWSManagedRulesCommonRuleSet"
      AWSManagedRulesKnownBadInputsRuleSet  = "AWS-AWSManagedRulesKnownBadInputsRuleSet"
      AWSManagedRulesSQLiRuleSet            = "AWS-AWSManagedRulesSQLiRuleSet"
      AWSManagedRulesLinuxRuleSet           = "AWS-AWSManagedRulesLinuxRuleSet"
      AWSManagedRulesATPRuleSet             = "AWS-AWSManagedRulesATPRuleSet"
    }

    content {
      name     = rule.key
      priority = rule.key == "AWSManagedRulesCommonRuleSet" ? 2 : (
        rule.key == "AWSManagedRulesKnownBadInputsRuleSet" ? 3 : (
          rule.key == "AWSManagedRulesSQLiRuleSet" ? 4 : (
            rule.key == "AWSManagedRulesLinuxRuleSet" ? 5 : 6
          )
        )
      )

      override_action {
        none {}
      }

      statement {
        managed_rule_group_statement {
          name        = rule.value
          vendor_name = "AWS"
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name               = "${local.name_prefix}-${rule.key}"
        sampled_requests_enabled  = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name               = "${local.name_prefix}-waf"
    sampled_requests_enabled  = true
  }

  tags = local.common_tags
}

# Security Group
resource "aws_security_group" "app_sg" {
  name        = "${local.name_prefix}-sg"
  description = "Security group for MemoryReel application"
  vpc_id      = var.vpc_id

  # HTTPS ingress
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
    description = "HTTPS inbound"
  }

  # Internal service communication
  ingress {
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    self        = true
    description = "Internal service communication"
  }

  # Monitoring endpoints
  ingress {
    from_port   = 9090
    to_port     = 9090
    protocol    = "tcp"
    self        = true
    description = "Monitoring endpoints"
  }

  # Health check endpoints
  ingress {
    from_port   = 8081
    to_port     = 8081
    protocol    = "tcp"
    self        = true
    description = "Health check endpoints"
  }

  # All outbound traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound traffic"
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-sg"
  })
}