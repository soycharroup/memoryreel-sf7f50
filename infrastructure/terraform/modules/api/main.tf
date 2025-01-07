# AWS Provider configuration for API infrastructure module
# Version: ~> 4.0
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# ECS Cluster for API services with capacity provider strategy
resource "aws_ecs_cluster" "main" {
  name = "${var.environment}-memoryreel-api"

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight           = 4
    base            = 1
  }

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight           = 1
  }

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = merge(
    var.tags,
    {
      Component = "API"
      Environment = var.environment
    }
  )
}

# Application Load Balancer for API services
resource "aws_lb" "api" {
  name               = "${var.environment}-memoryreel-api"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets           = var.subnet_ids

  enable_deletion_protection = true
  enable_http2             = true
  idle_timeout            = 60

  access_logs {
    bucket  = aws_s3_bucket.alb_logs.id
    prefix  = "alb-logs"
    enabled = true
  }

  tags = merge(
    var.tags,
    {
      Component = "API-ALB"
      Environment = var.environment
    }
  )
}

# ALB Target Group for API services
resource "aws_lb_target_group" "api" {
  name        = "${var.environment}-api"
  port        = var.api_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 3
    interval            = 30
    matcher            = "200"
    path               = var.health_check_path
    port               = "traffic-port"
    protocol           = "HTTP"
    timeout            = 5
    unhealthy_threshold = 3
  }

  tags = merge(
    var.tags,
    {
      Component = "API-TG"
      Environment = var.environment
    }
  )
}

# HTTPS Listener for API ALB
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"
  certificate_arn   = aws_acm_certificate.api.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# HTTP to HTTPS Redirect
resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.api.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ECS Task Definition for API containers
resource "aws_ecs_task_definition" "api" {
  family                   = "${var.environment}-memoryreel-api"
  requires_compatibilities = ["FARGATE"]
  network_mode            = "awsvpc"
  cpu                     = var.cpu
  memory                  = var.memory
  execution_role_arn      = var.ecs_execution_role_arn
  task_role_arn          = var.ecs_task_role_arn

  container_definitions = jsonencode([
    {
      name         = "api"
      image        = var.api_image
      essential    = true
      portMappings = [
        {
          containerPort = var.api_port
          protocol      = "tcp"
        }
      ]
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:${var.api_port}${var.health_check_path} || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = "/ecs/${var.environment}-memoryreel-api"
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "api"
        }
      }
    }
  ])

  tags = merge(
    var.tags,
    {
      Component = "API-Task"
      Environment = var.environment
    }
  )
}

# Security Group for ALB
resource "aws_security_group" "alb" {
  name_prefix = "${var.environment}-api-alb-"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    var.tags,
    {
      Component = "API-ALB-SG"
      Environment = var.environment
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# Security Group for API containers
resource "aws_security_group" "api" {
  name_prefix = "${var.environment}-api-ecs-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = var.api_port
    to_port         = var.api_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    var.tags,
    {
      Component = "API-ECS-SG"
      Environment = var.environment
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# S3 Bucket for ALB access logs
resource "aws_s3_bucket" "alb_logs" {
  bucket_prefix = "${var.environment}-memoryreel-alb-logs-"
  force_destroy = false

  tags = merge(
    var.tags,
    {
      Component = "API-ALB-Logs"
      Environment = var.environment
    }
  )
}

# S3 Bucket policy for ALB access logs
resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_elb_service_account.current.id}:root"
        }
        Action = "s3:PutObject"
        Resource = "${aws_s3_bucket.alb_logs.arn}/*"
      }
    ]
  })
}

# Data source for current AWS region
data "aws_region" "current" {}

# Data source for ELB service account
data "aws_elb_service_account" "current" {}

# Outputs
output "alb_dns_name" {
  value       = aws_lb.api.dns_name
  description = "DNS name of the Application Load Balancer"
}

output "ecs_cluster_id" {
  value       = aws_ecs_cluster.main.id
  description = "ID of the ECS cluster"
}

output "api_security_group_id" {
  value       = aws_security_group.api.id
  description = "ID of the API containers security group"
}