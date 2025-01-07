#!/bin/bash

# MemoryReel Backup Script
# Version: 1.0.0
# Dependencies:
# - aws-cli v2.x
# - mongodump v100.x
# - openssl v3.x
# - parallel latest

set -euo pipefail

# Global variables
BACKUP_ROOT="/opt/memoryreel/backups"
RETENTION_DAYS=30
BACKUP_PREFIX="memoryreel-backup"
LOG_FILE="/var/log/memoryreel/backup.log"
MAX_THREADS=4
COMPRESSION_LEVEL=9
RETRY_ATTEMPTS=3
BACKUP_CHUNK_SIZE="1GB"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_ID="${BACKUP_PREFIX}-${TIMESTAMP}"

# Logging function with ISO 8601 timestamp
log() {
    local level=$1
    local message=$2
    echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ")|${level}|backup|${message}|${BACKUP_ID}|$(date +%s%N)" >> "${LOG_FILE}"
}

# Error handling function
handle_error() {
    local exit_code=$?
    local line_number=$1
    log "ERROR" "Backup failed at line ${line_number} with exit code ${exit_code}"
    cleanup_failed_backup
    exit 1
}

trap 'handle_error ${LINENO}' ERR

# Cleanup function for failed backups
cleanup_failed_backup() {
    log "INFO" "Cleaning up failed backup artifacts"
    rm -rf "${BACKUP_ROOT}/tmp/${BACKUP_ID}"
    aws s3 rm "s3://${BACKUP_BUCKET}/${BACKUP_ID}" --recursive
}

# Setup backup environment
setup_backup_environment() {
    log "INFO" "Setting up backup environment"
    
    # Create required directories with secure permissions
    mkdir -p "${BACKUP_ROOT}/{mongodb,s3,tmp,logs}" 
    chmod 700 "${BACKUP_ROOT}"
    
    # Validate AWS credentials
    aws sts get-caller-identity > /dev/null || {
        log "ERROR" "AWS credentials validation failed"
        return 1
    }
    
    # Verify MongoDB connection
    mongosh --eval "db.adminCommand('ping')" > /dev/null || {
        log "ERROR" "MongoDB connection test failed"
        return 1
    }
    
    # Check available disk space (require at least 20% free)
    local free_space=$(df -h "${BACKUP_ROOT}" | awk 'NR==2 {print $5}' | tr -d '%')
    if [ "${free_space}" -gt 80 ]; then
        log "ERROR" "Insufficient disk space. ${free_space}% used"
        return 1
    }
    
    return 0
}

# MongoDB backup function with encryption and integrity verification
backup_mongodb() {
    local backup_path=$1
    local compression_level=$2
    
    log "INFO" "Starting MongoDB backup"
    
    # Generate encryption key and IV
    local encryption_key=$(openssl rand -hex 32)
    local encryption_iv=$(openssl rand -hex 16)
    
    # Store encryption keys securely (encrypted with KMS)
    aws kms encrypt \
        --key-id "${KMS_KEY_ID}" \
        --plaintext "${encryption_key}${encryption_iv}" \
        --output text --query CiphertextBlob \
        > "${backup_path}/encryption.key"
    
    # Perform MongoDB dump with compression
    mongodump \
        --uri="${MONGODB_URI}" \
        --gzip \
        --archive="${backup_path}/mongodb.archive" \
        --numParallelCollections=4 \
        || return 1
    
    # Encrypt the backup
    openssl enc -aes-256-cbc \
        -K "${encryption_key}" \
        -iv "${encryption_iv}" \
        -in "${backup_path}/mongodb.archive" \
        -out "${backup_path}/mongodb.archive.enc"
    
    # Generate checksum
    sha256sum "${backup_path}/mongodb.archive.enc" > "${backup_path}/mongodb.checksum"
    
    # Upload to S3 with server-side encryption
    aws s3 cp \
        "${backup_path}/mongodb.archive.enc" \
        "s3://${BACKUP_BUCKET}/${BACKUP_ID}/mongodb/" \
        --sse aws:kms \
        --sse-kms-key-id "${KMS_KEY_ID}"
    
    log "INFO" "MongoDB backup completed successfully"
    return 0
}

# S3 media backup function with parallel processing
backup_s3_media() {
    local source_bucket=$1
    local backup_path=$2
    local thread_count=$3
    
    log "INFO" "Starting S3 media backup"
    
    # List all objects in source bucket
    aws s3 ls "s3://${source_bucket}" --recursive \
        | awk '{print $4}' > "${backup_path}/file_list.txt"
    
    # Split file list for parallel processing
    split -n "l/${thread_count}" "${backup_path}/file_list.txt" "${backup_path}/chunk_"
    
    # Parallel sync function
    sync_chunk() {
        local chunk_file=$1
        local chunk_id=$(basename "${chunk_file}")
        
        aws s3 sync \
            "s3://${source_bucket}" \
            "s3://${BACKUP_BUCKET}/${BACKUP_ID}/media/${chunk_id}" \
            --only-show-errors \
            --sse aws:kms \
            --sse-kms-key-id "${KMS_KEY_ID}" \
            --include "*" \
            --exclude "*" \
            --include-from "${chunk_file}"
    }
    
    export -f sync_chunk
    
    # Execute parallel sync
    find "${backup_path}" -name "chunk_*" \
        | parallel -j "${thread_count}" sync_chunk {}
    
    log "INFO" "S3 media backup completed successfully"
    return 0
}

# Verify backup integrity
verify_backup_integrity() {
    local backup_id=$1
    local checksum_file=$2
    
    log "INFO" "Verifying backup integrity"
    
    # Download and verify MongoDB backup checksum
    aws s3 cp \
        "s3://${BACKUP_BUCKET}/${backup_id}/mongodb/mongodb.checksum" \
        "${BACKUP_ROOT}/tmp/verify_checksum"
    
    if ! sha256sum -c "${BACKUP_ROOT}/tmp/verify_checksum"; then
        log "ERROR" "Backup integrity verification failed"
        return 1
    fi
    
    # Verify sample media files
    aws s3 ls "s3://${BACKUP_BUCKET}/${backup_id}/media/" --recursive \
        | sort -R \
        | head -n 10 \
        | while read -r file; do
            if ! aws s3api head-object \
                --bucket "${BACKUP_BUCKET}" \
                --key "${file}" > /dev/null; then
                log "ERROR" "Media file verification failed: ${file}"
                return 1
            fi
        done
    
    log "INFO" "Backup integrity verification completed"
    return 0
}

# Main execution
main() {
    log "INFO" "Starting backup process ${BACKUP_ID}"
    
    # Setup environment
    setup_backup_environment || exit 1
    
    # Create temporary working directory
    local tmp_dir="${BACKUP_ROOT}/tmp/${BACKUP_ID}"
    mkdir -p "${tmp_dir}"
    
    # Backup MongoDB
    backup_mongodb "${tmp_dir}" "${COMPRESSION_LEVEL}" || exit 1
    
    # Backup S3 media
    backup_s3_media "${MEDIA_BUCKET}" "${tmp_dir}" "${MAX_THREADS}" || exit 1
    
    # Verify backup integrity
    verify_backup_integrity "${BACKUP_ID}" "${tmp_dir}/mongodb.checksum" || exit 1
    
    # Cleanup old backups
    aws s3 ls "s3://${BACKUP_BUCKET}/" \
        | awk '{print $2}' \
        | grep "^${BACKUP_PREFIX}" \
        | sort -r \
        | tail -n +$((RETENTION_DAYS + 1)) \
        | xargs -I {} aws s3 rm "s3://${BACKUP_BUCKET}/{}" --recursive
    
    # Cleanup temporary files
    rm -rf "${tmp_dir}"
    
    log "INFO" "Backup process completed successfully"
}

main "$@"