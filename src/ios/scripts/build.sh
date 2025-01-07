#!/bin/bash

# MemoryReel iOS/tvOS Build Script
# Version: 1.0
# Requires: Xcode 14.0+, CocoaPods 1.12.1+, Fastlane 2.212.2+

# Exit on error
set -e

# Import global variables
WORKSPACE="${WORKSPACE:-MemoryReel.xcworkspace}"
PROJECT="${PROJECT:-MemoryReel.xcodeproj}"
IOS_SCHEME="${IOS_SCHEME:-MemoryReel}"
TVOS_SCHEME="${TVOS_SCHEME:-MemoryReelTV}"
BUILD_DIR="${BUILD_DIR:-build}"
CONFIGURATION="${CONFIGURATION:-Release}"
LOG_LEVEL="${LOG_LEVEL:-INFO}"
CACHE_DIR="${HOME}/Library/Caches/MemoryReel"
CI_MODE="${CI:-false}"

# Initialize logging
log_file="${BUILD_DIR}/build_$(date +%Y%m%d_%H%M%S).log"
mkdir -p "${BUILD_DIR}"
mkdir -p "${CACHE_DIR}"

# Logging function
log() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] ${message}" | tee -a "${log_file}"
}

# Check dependencies
check_dependencies() {
    local log_level=$1
    log "${log_level}" "Checking build dependencies..."

    # Check Xcode
    if ! xcode-select -p &> /dev/null; then
        log "ERROR" "Xcode not found. Please install Xcode and try again."
        return 1
    fi

    # Check CocoaPods
    if ! command -v pod &> /dev/null; then
        log "ERROR" "CocoaPods not found. Please install CocoaPods and try again."
        return 1
    fi

    # Check Fastlane
    if ! command -v fastlane &> /dev/null; then
        log "ERROR" "Fastlane not found. Please install Fastlane and try again."
        return 1
    }

    # Verify versions
    local xcode_version=$(xcodebuild -version | head -n 1 | awk '{print $2}')
    local pod_version=$(pod --version)
    local fastlane_version=$(fastlane --version | head -n 1 | awk '{print $2}')

    log "${log_level}" "Xcode version: ${xcode_version}"
    log "${log_level}" "CocoaPods version: ${pod_version}"
    log "${log_level}" "Fastlane version: ${fastlane_version}"

    return 0
}

# Install dependencies
install_dependencies() {
    local cache_enabled=$1
    log "INFO" "Installing project dependencies..."

    if [ "${cache_enabled}" = true ] && [ -d "${CACHE_DIR}/Pods" ]; then
        log "INFO" "Using cached dependencies..."
        cp -R "${CACHE_DIR}/Pods" .
    else
        log "INFO" "Installing CocoaPods dependencies..."
        pod install --repo-update

        if [ "${cache_enabled}" = true ]; then
            log "INFO" "Caching dependencies..."
            rm -rf "${CACHE_DIR}/Pods"
            cp -R "Pods" "${CACHE_DIR}/"
        fi
    fi

    if [ ! -d "${WORKSPACE}" ]; then
        log "ERROR" "Workspace not found after dependency installation"
        return 1
    fi
}

# Setup code signing
setup_signing() {
    local environment=$1
    local platform=$2
    log "INFO" "Setting up code signing for ${platform} (${environment})..."

    if [ "${CI_MODE}" = true ]; then
        # CI signing setup using Fastlane Match
        fastlane run match(
            type: "${environment}",
            app_identifier: "com.memoryreel.${platform}",
            readonly: true
        )
    else
        # Development signing setup
        security unlock-keychain -p "${KEYCHAIN_PASSWORD}" "${HOME}/Library/Keychains/login.keychain"
    fi
}

# Build iOS app
build_ios() {
    local configuration=$1
    local clean_build=$2
    log "INFO" "Building iOS app (${configuration})..."

    if [ "${clean_build}" = true ]; then
        log "INFO" "Cleaning build directory..."
        rm -rf "${BUILD_DIR}/ios"
    fi

    mkdir -p "${BUILD_DIR}/ios"

    xcodebuild \
        -workspace "${WORKSPACE}" \
        -scheme "${IOS_SCHEME}" \
        -configuration "${configuration}" \
        -derivedDataPath "${BUILD_DIR}/ios/DerivedData" \
        -archivePath "${BUILD_DIR}/ios/${IOS_SCHEME}.xcarchive" \
        -destination "generic/platform=iOS" \
        clean archive | tee -a "${log_file}"

    if [ $? -ne 0 ]; then
        log "ERROR" "iOS build failed"
        return 1
    fi

    log "INFO" "iOS build completed successfully"
}

# Build tvOS app
build_tvos() {
    local configuration=$1
    local clean_build=$2
    log "INFO" "Building tvOS app (${configuration})..."

    if [ "${clean_build}" = true ]; then
        log "INFO" "Cleaning build directory..."
        rm -rf "${BUILD_DIR}/tvos"
    fi

    mkdir -p "${BUILD_DIR}/tvos"

    xcodebuild \
        -workspace "${WORKSPACE}" \
        -scheme "${TVOS_SCHEME}" \
        -configuration "${configuration}" \
        -derivedDataPath "${BUILD_DIR}/tvos/DerivedData" \
        -archivePath "${BUILD_DIR}/tvos/${TVOS_SCHEME}.xcarchive" \
        -destination "generic/platform=tvOS" \
        clean archive | tee -a "${log_file}"

    if [ $? -ne 0 ]; then
        log "ERROR" "tvOS build failed"
        return 1
    fi

    log "INFO" "tvOS build completed successfully"
}

# Main build process
main() {
    log "INFO" "Starting build process..."

    # Check dependencies
    if ! check_dependencies "${LOG_LEVEL}"; then
        log "ERROR" "Dependency check failed"
        exit 1
    fi

    # Install dependencies
    if ! install_dependencies true; then
        log "ERROR" "Dependency installation failed"
        exit 1
    fi

    # Setup signing for both platforms
    if ! setup_signing "${CONFIGURATION}" "ios"; then
        log "ERROR" "iOS signing setup failed"
        exit 1
    fi

    if ! setup_signing "${CONFIGURATION}" "tvos"; then
        log "ERROR" "tvOS signing setup failed"
        exit 1
    fi

    # Build iOS app
    if ! build_ios "${CONFIGURATION}" true; then
        log "ERROR" "iOS build failed"
        exit 1
    fi

    # Build tvOS app
    if ! build_tvos "${CONFIGURATION}" true; then
        log "ERROR" "tvOS build failed"
        exit 1
    fi

    log "INFO" "Build process completed successfully"
}

# Execute main process
main