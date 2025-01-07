#!/bin/bash

# MemoryReel Android Build Script
# Version: 1.0.0
# Supports building mobile and TV variants with AI integration
# Required external tools:
# - gradle v7.4.2
# - nodejs v18.x

set -e # Exit on error
set -o pipefail # Exit on pipe failure

# Constants
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly GRADLE_WRAPPER="${PROJECT_ROOT}/gradlew"
readonly BUILD_DIR="${PROJECT_ROOT}/app/build"
readonly OUTPUT_DIR="${BUILD_DIR}/outputs"
readonly LOG_DIR="${BUILD_DIR}/logs"
readonly KEYSTORE_DIR="${PROJECT_ROOT}/app/keystores"
readonly AI_CONFIG_DIR="${PROJECT_ROOT}/ai-config"
readonly LOG_FILE="${LOG_DIR}/build_$(date +%Y%m%d_%H%M%S).log"

# Ensure log directory exists
mkdir -p "${LOG_DIR}"

# Configure logging
exec 1> >(tee -a "${LOG_FILE}")
exec 2> >(tee -a "${LOG_FILE}" >&2)

# Logging functions
log_info() { echo "[INFO] $(date '+%Y-%m-%d %H:%M:%S') - $*"; }
log_error() { echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S') - $*" >&2; }
log_warning() { echo "[WARNING] $(date '+%Y-%m-%d %H:%M:%S') - $*" >&2; }

# Error handling
trap 'log_error "An error occurred. Exiting..."; exit 1' ERR

# Function to check build environment
check_environment() {
    log_info "Checking build environment..."

    # Check Android SDK
    if [[ -z "${ANDROID_HOME}" ]]; then
        log_error "ANDROID_HOME is not set"
        return 1
    fi

    # Check Java installation
    if ! command -v java >/dev/null; then
        log_error "Java is not installed"
        return 1
    fi

    # Check Node.js installation and version
    if ! command -v node >/dev/null; then
        log_error "Node.js is not installed"
        return 1
    fi
    
    local node_version=$(node --version)
    if [[ ! "${node_version}" =~ ^v18\. ]]; then
        log_error "Node.js version 18.x is required, found: ${node_version}"
        return 1
    }

    # Check Gradle wrapper
    if [[ ! -f "${GRADLE_WRAPPER}" ]]; then
        log_error "Gradle wrapper not found"
        return 1
    fi

    # Check AI configuration
    if [[ ! -d "${AI_CONFIG_DIR}" ]]; then
        log_error "AI configuration directory not found"
        return 1
    fi

    # Verify keystore for release builds
    if [[ "${BUILD_TYPE}" == "release" ]] && [[ ! -f "${KEYSTORE_DIR}/release.keystore" ]]; then
        log_error "Release keystore not found"
        return 1
    }

    log_info "Environment check passed"
    return 0
}

# Function to clean build artifacts
clean_build() {
    log_info "Cleaning build artifacts..."

    # Clean Gradle build
    "${GRADLE_WRAPPER}" clean || {
        log_error "Failed to clean Gradle build"
        return 1
    }

    # Clean React Native build
    if [[ -d "${PROJECT_ROOT}/android/app/build" ]]; then
        rm -rf "${PROJECT_ROOT}/android/app/build"
    fi

    # Clean AI processing temporary files
    if [[ -d "${AI_CONFIG_DIR}/temp" ]]; then
        rm -rf "${AI_CONFIG_DIR}/temp"
    }

    # Archive old logs
    find "${LOG_DIR}" -name "*.log" -mtime +7 -exec gzip {} \;

    log_info "Clean completed successfully"
    return 0
}

# Function to build the app
build_app() {
    local platform="$1"
    local build_type="$2"
    local ai_config="$3"

    log_info "Starting build for platform: ${platform}, type: ${build_type}"

    # Validate parameters
    if [[ ! "${platform}" =~ ^(mobile|tv)$ ]]; then
        log_error "Invalid platform: ${platform}"
        return 1
    fi

    if [[ ! "${build_type}" =~ ^(debug|release)$ ]]; then
        log_error "Invalid build type: ${build_type}"
        return 1
    }

    # Configure AI settings
    if [[ -f "${AI_CONFIG_DIR}/${ai_config}.json" ]]; then
        log_info "Applying AI configuration: ${ai_config}"
        cp "${AI_CONFIG_DIR}/${ai_config}.json" "${PROJECT_ROOT}/app/src/main/assets/ai_config.json"
    fi

    # Build React Native bundle
    log_info "Building React Native bundle..."
    npx react-native bundle \
        --platform android \
        --dev false \
        --entry-file index.js \
        --bundle-output "${PROJECT_ROOT}/app/src/main/assets/index.android.bundle" \
        --assets-dest "${PROJECT_ROOT}/app/src/main/res/" || {
        log_error "Failed to build React Native bundle"
        return 1
    }

    # Determine Gradle task based on build type and platform
    local gradle_task
    if [[ "${build_type}" == "release" ]]; then
        if [[ "${platform}" == "mobile" ]]; then
            gradle_task="assembleMobileRelease bundleMobileRelease"
        else
            gradle_task="assembleTvRelease"
        fi
    else
        if [[ "${platform}" == "mobile" ]]; then
            gradle_task="assembleMobileDebug"
        else
            gradle_task="assembleTvDebug"
        fi
    fi

    # Execute Gradle build
    log_info "Executing Gradle build: ${gradle_task}"
    "${GRADLE_WRAPPER}" ${gradle_task} || {
        log_error "Gradle build failed"
        return 1
    }

    # Copy build outputs to destination
    local output_subdir="${OUTPUT_DIR}/${platform}/${build_type}"
    mkdir -p "${output_subdir}"
    
    if [[ "${build_type}" == "release" ]]; then
        cp "${BUILD_DIR}/outputs/apk/${platform}/release/"*.apk "${output_subdir}/"
        if [[ "${platform}" == "mobile" ]]; then
            cp "${BUILD_DIR}/outputs/bundle/${platform}/release/"*.aab "${output_subdir}/"
        fi
    else
        cp "${BUILD_DIR}/outputs/apk/${platform}/debug/"*.apk "${output_subdir}/"
    fi

    log_info "Build completed successfully"
    return 0
}

# Function to sign release builds
sign_release() {
    local platform="$1"
    local keystore_config="$2"

    log_info "Signing release build for platform: ${platform}"

    # Validate keystore
    if [[ ! -f "${KEYSTORE_DIR}/release.keystore" ]]; then
        log_error "Release keystore not found"
        return 1
    fi

    # If in CI environment, decrypt keystore
    if [[ "${CI_MODE}" == "true" ]]; then
        log_info "CI mode detected, decrypting keystore..."
        # Add your keystore decryption logic here
    fi

    # Sign the APK/Bundle
    if [[ "${platform}" == "mobile" ]]; then
        "${GRADLE_WRAPPER}" signMobileReleaseBundle || {
            log_error "Failed to sign release bundle"
            return 1
        }
    fi

    "${GRADLE_WRAPPER}" signRelease${platform^}Apk || {
        log_error "Failed to sign release APK"
        return 1
    }

    # Verify signature
    local verify_cmd="jarsigner -verify -verbose -certs"
    if [[ "${platform}" == "mobile" ]]; then
        ${verify_cmd} "${OUTPUT_DIR}/${platform}/release/"*.aab
    fi
    ${verify_cmd} "${OUTPUT_DIR}/${platform}/release/"*.apk

    log_info "Signing completed successfully"
    return 0
}

# Main execution
main() {
    local platform="$1"
    local build_type="$2"
    local ai_config="$3"

    # Validate required parameters
    if [[ -z "${platform}" ]] || [[ -z "${build_type}" ]]; then
        log_error "Usage: $0 <mobile|tv> <debug|release> [ai_config]"
        exit 1
    }

    # Execute build steps
    check_environment || exit 1
    clean_build || exit 1
    build_app "${platform}" "${build_type}" "${ai_config}" || exit 1

    # Sign release builds
    if [[ "${build_type}" == "release" ]]; then
        sign_release "${platform}" "release_config" || exit 1
    fi

    log_info "Build process completed successfully"
    exit 0
}

# Execute main function with provided arguments
main "$@"