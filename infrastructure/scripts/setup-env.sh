#!/usr/bin/env bash

# MemoryReel Platform Environment Setup Script
# Version: 1.0.0
# Dependencies:
# - aws-cli v2.x
# - terraform v1.5+
# - datadog-agent v7.x

set -euo pipefail
IFS=$'\n\t'

# Global Constants
readonly PROJECT_NAME="memoryreel"
readonly AWS_DEFAULT_REGION="us-east-1"
readonly SUPPORTED_ENVIRONMENTS=("dev" "staging" "prod")
readonly LOG_LEVEL="INFO"
readonly RETRY_ATTEMPTS=3
readonly HEALTH_CHECK_TIMEOUT=30

# Logging Configuration
setup_logging() {
    local log_file="/var/log/${PROJECT_NAME}/setup-env.log"
    mkdir -p "$(dirname "$log_file")"
    exec 1> >(tee -a "$log_file")
    exec 2> >(tee -a "$log_file" >&2)
    log "INFO" "Logging initialized to $log_file"
}

log() {
    local level="$1"
    local message="$2"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$level] $message"
}

# Function Decorators
retry_on_failure() {
    local attempt=1
    until "$@" || [ $attempt -eq $RETRY_ATTEMPTS ]; do
        log "WARN" "Command failed, retrying (attempt $attempt of $RETRY_ATTEMPTS)..."
        attempt=$((attempt + 1))
        sleep $((attempt * 2))
    done
    if [ $attempt -eq $RETRY_ATTEMPTS ]; then
        log "ERROR" "Command failed after $RETRY_ATTEMPTS attempts"
        return 1
    fi
}

# Environment Validation
validate_environment() {
    local env="$1"
    
    # Check if environment is supported
    if [[ ! " ${SUPPORTED_ENVIRONMENTS[@]} " =~ " ${env} " ]]; then
        log "ERROR" "Invalid environment: $env"
        return 1
    }

    # Verify environment directory
    local env_dir="environments/$env"
    if [ ! -d "$env_dir" ]; then
        log "ERROR" "Environment directory not found: $env_dir"
        return 1
    }

    # Validate required configuration files
    local required_files=("terraform.tfvars" "backend.tf" "provider.tf")
    for file in "${required_files[@]}"; do
        if [ ! -f "$env_dir/$file" ]; then
            log "ERROR" "Required configuration file missing: $env_dir/$file"
            return 1
        fi
    done

    # Verify KMS key accessibility
    if ! aws kms describe-key --key-id "alias/${PROJECT_NAME}-${env}" >/dev/null 2>&1; then
        log "ERROR" "Unable to access KMS key for environment: $env"
        return 1
    }

    log "INFO" "Environment validation successful: $env"
    return 0
}

# AWS Credentials Setup
setup_aws_credentials() {
    local env="$1"
    local profile_name="${PROJECT_NAME}-${env}"

    log "INFO" "Setting up AWS credentials for environment: $env"

    # Decrypt and configure AWS credentials
    local credentials
    credentials=$(aws kms decrypt \
        --key-id "alias/${PROJECT_NAME}-${env}" \
        --ciphertext-blob "fileb://secrets/${env}/aws-credentials.encrypted" \
        --output text --query Plaintext | base64 --decode)

    # Configure AWS CLI profile
    aws configure set aws_access_key_id "$(echo "$credentials" | jq -r .access_key)" --profile "$profile_name"
    aws configure set aws_secret_access_key "$(echo "$credentials" | jq -r .secret_key)" --profile "$profile_name"
    aws configure set region "$AWS_DEFAULT_REGION" --profile "$profile_name"

    # Verify credentials
    if ! aws sts get-caller-identity --profile "$profile_name" >/dev/null 2>&1; then
        log "ERROR" "Failed to verify AWS credentials"
        return 1
    fi

    export AWS_PROFILE="$profile_name"
    log "INFO" "AWS credentials configured successfully"
    return 0
}

# AI Provider Configuration
setup_ai_providers() {
    local env="$1"
    
    log "INFO" "Configuring AI providers for environment: $env"

    # Decrypt AI provider credentials
    local ai_credentials
    ai_credentials=$(aws kms decrypt \
        --key-id "alias/${PROJECT_NAME}-${env}" \
        --ciphertext-blob "fileb://secrets/${env}/ai-credentials.encrypted" \
        --output text --query Plaintext | base64 --decode)

    # Configure OpenAI (Primary)
    export OPENAI_API_KEY="$(echo "$ai_credentials" | jq -r .openai_key)"
    
    # Configure AWS Rekognition (Secondary)
    export AWS_REKOGNITION_REGION="$AWS_DEFAULT_REGION"
    
    # Configure Google Vision AI (Tertiary)
    export GOOGLE_APPLICATION_CREDENTIALS="$(echo "$ai_credentials" | jq -r .google_credentials)"

    # Validate AI provider endpoints
    local providers=("openai" "rekognition" "google-vision")
    for provider in "${providers[@]}"; do
        if ! validate_ai_provider "$provider"; then
            log "ERROR" "Failed to validate AI provider: $provider"
            return 1
        fi
    done

    # Export AI provider configurations
    export AI_PROVIDER_CONFIGS='{
        "primary": "openai",
        "secondary": "rekognition",
        "tertiary": "google-vision",
        "failover_threshold": 3,
        "health_check_interval": 60
    }'

    log "INFO" "AI providers configured successfully"
    return 0
}

# Monitoring Setup
setup_monitoring() {
    local env="$1"
    
    log "INFO" "Setting up monitoring for environment: $env"

    # Configure DataDog agent
    local monitoring_credentials
    monitoring_credentials=$(aws kms decrypt \
        --key-id "alias/${PROJECT_NAME}-${env}" \
        --ciphertext-blob "fileb://secrets/${env}/monitoring-credentials.encrypted" \
        --output text --query Plaintext | base64 --decode)

    export DD_API_KEY="$(echo "$monitoring_credentials" | jq -r .datadog_api_key)"
    export DD_SITE="datadoghq.com"
    export DD_ENV="$env"
    export DD_SERVICE="$PROJECT_NAME"

    # Initialize DataDog agent
    if ! datadog-agent start; then
        log "ERROR" "Failed to start DataDog agent"
        return 1
    fi

    # Configure monitoring thresholds
    export MONITORING_CONFIG='{
        "cpu_threshold": 80,
        "memory_threshold": 85,
        "api_latency_threshold": 1000,
        "error_rate_threshold": 1
    }'

    # Setup CloudWatch logging
    aws logs create-log-group --log-group-name "/${PROJECT_NAME}/${env}" || true
    aws logs put-retention-policy \
        --log-group-name "/${PROJECT_NAME}/${env}" \
        --retention-in-days 30

    log "INFO" "Monitoring setup completed successfully"
    return 0
}

# Main Script Execution
main() {
    if [ "$#" -ne 1 ]; then
        log "ERROR" "Usage: $0 <environment>"
        exit 1
    fi

    local environment="$1"
    setup_logging

    log "INFO" "Starting environment setup for: $environment"

    # Execute setup steps with validation
    if ! validate_environment "$environment"; then
        log "ERROR" "Environment validation failed"
        exit 1
    fi

    if ! setup_aws_credentials "$environment"; then
        log "ERROR" "AWS credentials setup failed"
        exit 1
    fi

    if ! setup_ai_providers "$environment"; then
        log "ERROR" "AI providers setup failed"
        exit 1
    fi

    if ! setup_monitoring "$environment"; then
        log "ERROR" "Monitoring setup failed"
        exit 1
    }

    log "INFO" "Environment setup completed successfully"
    return 0
}

# Script entry point with error handling
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    trap 'log "ERROR" "Script failed on line $LINENO"' ERR
    main "$@"
fi