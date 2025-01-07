#!/bin/bash

# MemoryReel Platform Monitoring Setup Script
# Version: 1.0.0
# This script sets up comprehensive monitoring infrastructure including 
# CloudWatch, DataDog, Prometheus, Grafana, and ELK Stack

set -euo pipefail

# Source environment variables
source ./setup-env.sh

# Global Variables with defaults
ENVIRONMENT=${ENVIRONMENT:-dev}
AWS_REGION=${AWS_REGION:-us-east-1}
LOG_RETENTION_DAYS=${LOG_RETENTION_DAYS:-30}
MONITORING_BACKUP_ENABLED=${MONITORING_BACKUP_ENABLED:-true}
SECURITY_ENCRYPTION_ENABLED=${SECURITY_ENCRYPTION_ENABLED:-true}

# Validate prerequisites and dependencies
validate_prerequisites() {
    echo "Validating prerequisites..."
    
    # Check required tools
    local required_tools=("aws" "kubectl" "helm" "curl" "jq")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            echo "Error: Required tool $tool is not installed"
            return 1
        fi
    done

    # Verify AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        echo "Error: Invalid AWS credentials"
        return 1
    }

    # Validate DataDog API key
    if [[ -z "${DATADOG_API_KEY:-}" ]]; then
        echo "Error: DATADOG_API_KEY is not set"
        return 1
    fi

    # Check Kubernetes context
    if ! kubectl cluster-info &> /dev/null; then
        echo "Error: Invalid Kubernetes context"
        return 1
    }

    return 0
}

# Setup CloudWatch monitoring
setup_cloudwatch() {
    echo "Setting up CloudWatch monitoring..."

    # Create log groups with encryption
    aws logs create-log-group \
        --log-group-name "/aws/memoryreel/${ENVIRONMENT}/application" \
        --kms-key-id "alias/aws/logs" \
        --tags "Environment=${ENVIRONMENT},Project=memoryreel,Type=application"

    aws logs create-log-group \
        --log-group-name "/aws/memoryreel/${ENVIRONMENT}/api" \
        --kms-key-id "alias/aws/logs" \
        --tags "Environment=${ENVIRONMENT},Project=memoryreel,Type=api"

    # Set retention policy
    aws logs put-retention-policy \
        --log-group-name "/aws/memoryreel/${ENVIRONMENT}/application" \
        --retention-in-days "$LOG_RETENTION_DAYS"

    aws logs put-retention-policy \
        --log-group-name "/aws/memoryreel/${ENVIRONMENT}/api" \
        --retention-in-days "$LOG_RETENTION_DAYS"

    # Create metric filters for error tracking
    aws logs put-metric-filter \
        --log-group-name "/aws/memoryreel/${ENVIRONMENT}/api" \
        --filter-name "ErrorMetrics" \
        --filter-pattern "ERROR" \
        --metric-transformations \
            metricName=ApiErrors,metricNamespace=MemoryReel,metricValue=1

    return 0
}

# Setup DataDog monitoring
setup_datadog() {
    echo "Setting up DataDog monitoring..."

    # Install DataDog agent with security configurations
    helm repo add datadog https://helm.datadoghq.com
    helm repo update

    helm upgrade --install datadog-agent datadog/datadog \
        --namespace monitoring \
        --create-namespace \
        --set datadog.apiKey="$DATADOG_API_KEY" \
        --set datadog.apm.enabled=true \
        --set datadog.logs.enabled=true \
        --set datadog.logs.containerCollectAll=true \
        --set datadog.securityAgent.runtime.enabled=true \
        --set datadog.checksCardinality=high \
        --set agents.tolerations[0].key="monitoring" \
        --set agents.tolerations[0].value="true" \
        --set agents.tolerations[0].effect="NoSchedule"

    return 0
}

# Setup Prometheus and Grafana
setup_prometheus_grafana() {
    echo "Setting up Prometheus and Grafana..."

    # Add Helm repositories
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo add grafana https://grafana.github.io/helm-charts
    helm repo update

    # Install Prometheus with security configurations
    helm upgrade --install prometheus prometheus-community/prometheus \
        --namespace monitoring \
        --create-namespace \
        --set server.securityContext.runAsUser=65534 \
        --set server.securityContext.runAsNonRoot=true \
        --set server.persistentVolume.enabled=true \
        --set server.retention="15d" \
        --set alertmanager.persistentVolume.enabled=true

    # Install Grafana with security configurations
    helm upgrade --install grafana grafana/grafana \
        --namespace monitoring \
        --set persistence.enabled=true \
        --set adminPassword="$(openssl rand -base64 32)" \
        --set securityContext.runAsUser=472 \
        --set securityContext.runAsGroup=472 \
        --set encryption.enabled=true \
        --set encryption.secretName="grafana-encryption" \
        --set "grafana\.ini".server.root_url="https://grafana.memoryreel.com"

    return 0
}

# Setup ELK Stack
setup_elk() {
    echo "Setting up ELK Stack..."

    # Add Elastic Helm repository
    helm repo add elastic https://helm.elastic.co
    helm repo update

    # Install Elasticsearch with security configurations
    helm upgrade --install elasticsearch elastic/elasticsearch \
        --namespace monitoring \
        --set clusterName="memoryreel-${ENVIRONMENT}" \
        --set replicas=3 \
        --set minimumMasterNodes=2 \
        --set persistence.enabled=true \
        --set esJavaOpts="-Xmx2g -Xms2g" \
        --set resources.requests.cpu="1000m" \
        --set resources.limits.cpu="2000m" \
        --set xpack.security.enabled=true \
        --set xpack.security.transport.ssl.enabled=true

    # Install Kibana
    helm upgrade --install kibana elastic/kibana \
        --namespace monitoring \
        --set elasticsearchHosts="http://elasticsearch-master:9200" \
        --set resources.requests.cpu="500m" \
        --set resources.limits.cpu="1000m" \
        --set xpack.security.enabled=true \
        --set server.basePath="/kibana" \
        --set server.rewriteBasePath=true

    # Install Logstash
    helm upgrade --install logstash elastic/logstash \
        --namespace monitoring \
        --set persistence.enabled=true \
        --set xpack.monitoring.enabled=true \
        --set resources.requests.cpu="500m" \
        --set resources.limits.cpu="1000m"

    return 0
}

# Main execution
main() {
    echo "Starting MemoryReel monitoring setup..."

    # Validate prerequisites
    if ! validate_prerequisites; then
        echo "Prerequisites validation failed"
        exit 1
    fi

    # Setup each component
    if ! setup_cloudwatch; then
        echo "CloudWatch setup failed"
        exit 1
    fi

    if ! setup_datadog; then
        echo "DataDog setup failed"
        exit 1
    fi

    if ! setup_prometheus_grafana; then
        echo "Prometheus/Grafana setup failed"
        exit 1
    fi

    if ! setup_elk; then
        echo "ELK Stack setup failed"
        exit 1
    fi

    echo "Monitoring setup completed successfully"
    return 0
}

# Execute main function
main "$@"