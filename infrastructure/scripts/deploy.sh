#!/bin/bash

# MemoryReel Platform Deployment Script
# Version: 1.0.0
# Dependencies:
# - kubectl v1.25+
# - kustomize v5.0.0
# - aws-cli 2.x

set -euo pipefail

# Global Configuration
readonly ENVIRONMENTS=("dev" "staging" "prod")
readonly REGIONS=("us-east-1" "eu-west-1" "ap-southeast-2")
readonly REQUIRED_TOOLS=("kubectl" "kustomize" "aws" "helm")
readonly HEALTH_CHECK_TIMEOUT=300
readonly ROLLOUT_TIMEOUT=600
readonly MAX_SURGE="25%"
readonly MAX_UNAVAILABLE=0
readonly LOG_FILE="/var/log/memoryreel/deployments.log"

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m'

# Logging function
log() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "${LOG_FILE}"
}

# Check prerequisites for deployment
check_prerequisites() {
    log "INFO" "Checking deployment prerequisites..."
    
    # Create log directory if it doesn't exist
    mkdir -p "$(dirname "${LOG_FILE}")"
    
    # Verify required tools
    for tool in "${REQUIRED_TOOLS[@]}"; do
        if ! command -v "${tool}" &> /dev/null; then
            log "ERROR" "Required tool ${tool} not found"
            return 1
        fi
        
        # Version check for kubectl
        if [[ "${tool}" == "kubectl" ]]; then
            local version=$(kubectl version --client -o json | jq -r '.clientVersion.gitVersion')
            if [[ "${version}" < "v1.25" ]]; then
                log "ERROR" "kubectl version ${version} is below required v1.25+"
                return 1
            fi
        fi
    done
    
    # Verify AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log "ERROR" "Invalid AWS credentials"
        return 1
    }
    
    # Check cluster connectivity
    if ! kubectl cluster-info &> /dev/null; then
        log "ERROR" "Cannot connect to Kubernetes cluster"
        return 1
    }
    
    log "INFO" "Prerequisites check completed successfully"
    return 0
}

# Deploy to specific environment
deploy_environment() {
    local environment=$1
    local version_tag=$2
    
    log "INFO" "Starting deployment to ${environment} environment with version ${version_tag}"
    
    # Validate environment
    if [[ ! " ${ENVIRONMENTS[@]} " =~ " ${environment} " ]]; then
        log "ERROR" "Invalid environment: ${environment}"
        return 1
    }
    
    # Create deployment snapshot for rollback
    local snapshot_time=$(date +%Y%m%d_%H%M%S)
    local snapshot_dir="/tmp/memoryreel_snapshot_${environment}_${snapshot_time}"
    mkdir -p "${snapshot_dir}"
    kubectl get all -n "memoryreel-${environment}" -o yaml > "${snapshot_dir}/pre_deployment_state.yaml"
    
    # Apply kustomize overlays
    log "INFO" "Applying kustomize overlays for ${environment}"
    kustomize build "infrastructure/kubernetes/overlays/${environment}" | \
        sed "s/\${TAG}/${version_tag}/g" | \
        kubectl apply -f -
    
    # Monitor deployment rollout
    local deployments=("memoryreel-backend" "memoryreel-web")
    for deployment in "${deployments[@]}"; do
        log "INFO" "Monitoring rollout of ${deployment}"
        if ! kubectl rollout status deployment/${deployment} -n "memoryreel-${environment}" --timeout="${ROLLOUT_TIMEOUT}s"; then
            log "ERROR" "Deployment ${deployment} failed to roll out"
            rollback_deployment "${environment}" "${snapshot_dir}"
            return 1
        fi
    done
    
    # Verify deployment health
    if ! verify_deployment "${environment}"; then
        log "ERROR" "Deployment verification failed"
        rollback_deployment "${environment}" "${snapshot_dir}"
        return 1
    }
    
    log "INFO" "Deployment to ${environment} completed successfully"
    return 0
}

# Verify deployment health
verify_deployment() {
    local environment=$1
    local namespace="memoryreel-${environment}"
    
    log "INFO" "Verifying deployment health in ${environment}"
    
    # Check pod health
    local unhealthy_pods=$(kubectl get pods -n "${namespace}" -o json | \
        jq -r '.items[] | select(.status.phase != "Running" or (.status.conditions[] | select(.type == "Ready" and .status != "True"))) | .metadata.name')
    
    if [[ -n "${unhealthy_pods}" ]]; then
        log "ERROR" "Unhealthy pods detected: ${unhealthy_pods}"
        return 1
    }
    
    # Check service endpoints
    local services=("backend" "web")
    for service in "${services[@]}"; do
        if ! kubectl get endpoints "memoryreel-${service}" -n "${namespace}" -o json | \
            jq -e '.subsets[].addresses | length > 0' &> /dev/null; then
            log "ERROR" "No endpoints available for service ${service}"
            return 1
        fi
    done
    
    # Verify health endpoints
    for service in "${services[@]}"; do
        local pod_name=$(kubectl get pods -n "${namespace}" -l "app=memoryreel,component=${service}" -o jsonpath='{.items[0].metadata.name}')
        if ! kubectl exec "${pod_name}" -n "${namespace}" -- curl -s http://localhost/health | grep -q "ok"; then
            log "ERROR" "Health check failed for ${service}"
            return 1
        fi
    done
    
    log "INFO" "Deployment verification completed successfully"
    return 0
}

# Rollback deployment
rollback_deployment() {
    local environment=$1
    local snapshot_dir=$2
    
    log "WARNING" "Initiating rollback for ${environment}"
    
    # Apply previous state
    if kubectl apply -f "${snapshot_dir}/pre_deployment_state.yaml"; then
        log "INFO" "Rollback completed successfully"
        
        # Notify stakeholders
        send_notification "Deployment rollback completed for ${environment}"
        
        # Cleanup snapshot
        rm -rf "${snapshot_dir}"
        return 0
    else
        log "ERROR" "Rollback failed"
        return 1
    fi
}

# Send notification
send_notification() {
    local message=$1
    # Implementation depends on notification system
    # Example: AWS SNS, Slack, etc.
    log "INFO" "Notification: ${message}"
}

# Main execution
main() {
    local environment=$1
    local version_tag=$2
    
    log "INFO" "Starting deployment process"
    
    if ! check_prerequisites; then
        log "ERROR" "Prerequisites check failed"
        exit 1
    fi
    
    if ! deploy_environment "${environment}" "${version_tag}"; then
        log "ERROR" "Deployment failed"
        exit 1
    fi
    
    log "INFO" "Deployment process completed successfully"
}

# Script execution
if [[ $# -ne 2 ]]; then
    echo "Usage: $0 <environment> <version_tag>"
    echo "Environments: ${ENVIRONMENTS[*]}"
    exit 1
fi

main "$1" "$2"