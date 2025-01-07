# AWS Provider configuration
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# Local variables for resource naming and tagging
locals {
  common_tags = merge(
    {
      Project     = "MemoryReel"
      Environment = var.environment
      ManagedBy   = "Terraform"
      LastUpdated = timestamp()
    },
    var.tags
  )
  az_count          = length(var.availability_zones)
  nat_gateway_count = var.single_nat_gateway ? 1 : local.az_count
}

# VPC Configuration
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  tags = merge(local.common_tags, {
    Name = format("%s-vpc", var.environment)
  })
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  
  tags = merge(local.common_tags, {
    Name = format("%s-igw", var.environment)
  })
}

# Public Subnets
resource "aws_subnet" "public" {
  count                   = local.az_count
  vpc_id                  = aws_vpc.main.id
  cidr_block             = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone      = var.availability_zones[count.index]
  map_public_ip_on_launch = true
  
  tags = merge(local.common_tags, {
    Name = format("%s-public-%s", var.environment, var.availability_zones[count.index])
    Tier = "Public"
  })
}

# Private Subnets
resource "aws_subnet" "private" {
  count             = local.az_count
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + local.az_count)
  availability_zone = var.availability_zones[count.index]
  
  tags = merge(local.common_tags, {
    Name = format("%s-private-%s", var.environment, var.availability_zones[count.index])
    Tier = "Private"
  })
}

# Elastic IPs for NAT Gateways
resource "aws_eip" "nat" {
  count = var.enable_nat_gateway ? local.nat_gateway_count : 0
  vpc   = true
  
  tags = merge(local.common_tags, {
    Name = format("%s-eip-%s", var.environment, var.availability_zones[count.index])
  })
}

# NAT Gateways
resource "aws_nat_gateway" "main" {
  count         = var.enable_nat_gateway ? local.nat_gateway_count : 0
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  
  tags = merge(local.common_tags, {
    Name = format("%s-nat-%s", var.environment, var.availability_zones[count.index])
  })

  depends_on = [aws_internet_gateway.main]
}

# Route Tables
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  
  tags = merge(local.common_tags, {
    Name = format("%s-public-rt", var.environment)
  })
}

resource "aws_route_table" "private" {
  count  = local.az_count
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = var.enable_nat_gateway ? aws_nat_gateway.main[var.single_nat_gateway ? 0 : count.index].id : null
  }
  
  tags = merge(local.common_tags, {
    Name = format("%s-private-rt-%s", var.environment, var.availability_zones[count.index])
  })
}

# Route Table Associations
resource "aws_route_table_association" "public" {
  count          = local.az_count
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = local.az_count
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# VPC Flow Logs
resource "aws_flow_log" "main" {
  count                = var.enable_vpc_flow_logs ? 1 : 0
  iam_role_arn        = aws_iam_role.flow_log[0].arn
  log_destination     = aws_cloudwatch_log_group.flow_log[0].arn
  traffic_type        = "ALL"
  vpc_id              = aws_vpc.main.id
  
  tags = merge(local.common_tags, {
    Name = format("%s-flow-log", var.environment)
  })
}

# Flow Logs IAM Role
resource "aws_iam_role" "flow_log" {
  count = var.enable_vpc_flow_logs ? 1 : 0
  name  = format("%s-flow-log-role", var.environment)

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "vpc-flow-logs.amazonaws.com"
        }
      }
    ]
  })
  
  tags = local.common_tags
}

# Flow Logs CloudWatch Log Group
resource "aws_cloudwatch_log_group" "flow_log" {
  count             = var.enable_vpc_flow_logs ? 1 : 0
  name              = format("/aws/vpc/flow-log/%s", var.environment)
  retention_in_days = 30
  
  tags = local.common_tags
}

# Outputs
output "vpc_id" {
  description = "ID of the created VPC"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets"
  value       = aws_subnet.private[*].id
}