# VPC Output
output "vpc_id" {
  description = "The ID of the VPC created for the MemoryReel platform"
  value       = aws_vpc.main.id
  type        = string
  sensitive   = false
}

# Public Subnet Outputs
output "public_subnet_ids" {
  description = "List of public subnet IDs across availability zones for load balancers and NAT gateways"
  value       = aws_subnet.public[*].id
  type        = list(string)
  sensitive   = false

  depends_on = [
    aws_vpc.main,
    aws_subnet.public
  ]
}

# Private Subnet Outputs
output "private_subnet_ids" {
  description = "List of private subnet IDs across availability zones for application and database resources"
  value       = aws_subnet.private[*].id
  type        = list(string)
  sensitive   = false

  depends_on = [
    aws_vpc.main,
    aws_subnet.private,
    aws_nat_gateway.main
  ]
}

# NAT Gateway Outputs
output "nat_gateway_ids" {
  description = "List of NAT Gateway IDs providing internet access for private subnets"
  value       = aws_nat_gateway.main[*].id
  type        = list(string)
  sensitive   = false

  depends_on = [
    aws_nat_gateway.main
  ]
}

# Internet Gateway Output
output "internet_gateway_id" {
  description = "ID of the Internet Gateway providing internet access for public subnets"
  value       = aws_internet_gateway.main.id
  type        = string
  sensitive   = false

  depends_on = [
    aws_internet_gateway.main
  ]
}

# Route Table Outputs
output "public_route_table_id" {
  description = "ID of the public route table for internet-facing resources"
  value       = aws_route_table.public.id
  type        = string
  sensitive   = false
}

output "private_route_table_ids" {
  description = "List of private route table IDs for internal resources"
  value       = aws_route_table.private[*].id
  type        = list(string)
  sensitive   = false
}

# VPC CIDR Output
output "vpc_cidr_block" {
  description = "The CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
  type        = string
  sensitive   = false
}

# Availability Zone Outputs
output "availability_zones" {
  description = "List of availability zones where the networking resources are deployed"
  value       = var.availability_zones
  type        = list(string)
  sensitive   = false
}