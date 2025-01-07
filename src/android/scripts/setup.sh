#!/bin/bash

# MemoryReel Android Development Environment Setup Script
# Version: 1.0.0
# Supports: Android Mobile and TV Development
# Required: JDK 11+, Node.js 18.x, 8GB+ RAM, 10GB+ free disk space

# Strict error handling
set -euo pipefail
trap cleanup EXIT

# Global variables
readonly NODE_VERSION="18.x"
readonly MIN_MEMORY_GB=8
readonly MIN_DISK_SPACE_GB=10
readonly LOG_FILE="memoryreel_setup.log"
readonly REQUIRED_SDK_PACKAGES=(
    "platforms;android-33"
    "build-tools;33.0.0"
    "platform-tools"
    "extras;android;m2repository"
    "extras;google;m2repository"
    "system-images;android-33;google_apis;x86_64"
    "add-ons;addon-google_apis-google-24"
    "extras;google;auto"
    "extras;google;simulators"
)

# Enhanced logging function
log() {
    local level=$1
    shift
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $*" | tee -a "$LOG_FILE"
}

# Cleanup function
cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        log "ERROR" "Setup failed. Check $LOG_FILE for details"
    fi
    # Remove temporary files
    rm -f ./*.tmp
    return $exit_code
}

# Check system prerequisites
check_prerequisites() {
    log "INFO" "Checking system prerequisites..."

    # Check memory
    local total_memory_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    local total_memory_gb=$((total_memory_kb / 1024 / 1024))
    if [ "$total_memory_gb" -lt "$MIN_MEMORY_GB" ]; then
        log "ERROR" "Insufficient memory. Required: ${MIN_MEMORY_GB}GB, Found: ${total_memory_gb}GB"
        return 1
    fi

    # Check disk space
    local free_space_kb=$(df -k . | awk 'NR==2 {print $4}')
    local free_space_gb=$((free_space_kb / 1024 / 1024))
    if [ "$free_space_gb" -lt "$MIN_DISK_SPACE_GB" ]; then
        log "ERROR" "Insufficient disk space. Required: ${MIN_DISK_SPACE_GB}GB, Found: ${free_space_gb}GB"
        return 1
    }

    # Check Java installation
    if ! command -v java >/dev/null 2>&1; then
        log "ERROR" "Java not found. Please install JDK 11 or higher"
        return 1
    fi
    local java_version=$(java -version 2>&1 | awk -F '"' '/version/ {print $2}' | cut -d'.' -f1)
    if [ "$java_version" -lt "11" ]; then
        log "ERROR" "Java 11+ required. Found version: $java_version"
        return 1
    fi

    # Check Node.js installation
    if ! command -v node >/dev/null 2>&1; then
        log "ERROR" "Node.js not found. Please install Node.js ${NODE_VERSION}"
        return 1
    fi
    local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt "18" ]; then
        log "ERROR" "Node.js 18+ required. Found version: $node_version"
        return 1
    }

    # Validate ANDROID_HOME
    if [ -z "${ANDROID_HOME:-}" ]; then
        if [ -d "$HOME/Android/Sdk" ]; then
            export ANDROID_HOME="$HOME/Android/Sdk"
        else
            log "ERROR" "ANDROID_HOME not set and default location not found"
            return 1
        fi
    fi

    log "INFO" "Prerequisites check passed"
    return 0
}

# Setup Android SDK
setup_android_sdk() {
    log "INFO" "Setting up Android SDK components..."

    # Accept licenses
    yes | sdkmanager --licenses >/dev/null 2>&1 || {
        log "ERROR" "Failed to accept Android SDK licenses"
        return 1
    }

    # Install required SDK packages
    for package in "${REQUIRED_SDK_PACKAGES[@]}"; do
        log "INFO" "Installing $package..."
        if ! sdkmanager "$package" >/dev/null 2>&1; then
            log "ERROR" "Failed to install $package"
            return 1
        fi
    done

    # Verify NDK installation
    if [ ! -d "$ANDROID_HOME/ndk" ]; then
        log "INFO" "Installing Android NDK..."
        sdkmanager --install "ndk;23.1.7779620" >/dev/null 2>&1 || {
            log "ERROR" "Failed to install Android NDK"
            return 1
        }
    fi

    log "INFO" "Android SDK setup completed"
    return 0
}

# Setup project properties
setup_project_properties() {
    log "INFO" "Configuring project properties..."

    # Create local.properties
    cat > local.properties << EOF
sdk.dir=$ANDROID_HOME
ndk.dir=$ANDROID_HOME/ndk/23.1.7779620
tv.sdk.dir=$ANDROID_HOME
EOF

    # Configure gradle properties
    cat > gradle.properties << EOF
org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=2g -XX:+HeapDumpOnOutOfMemoryError
org.gradle.daemon=true
org.gradle.parallel=true
org.gradle.caching=true
android.useAndroidX=true
android.enableJetifier=true
android.enableR8.fullMode=true
kotlin.code.style=official
EOF

    # Setup debug keystore if not exists
    if [ ! -f "app/debug.keystore" ]; then
        log "INFO" "Generating debug keystore..."
        keytool -genkey -v -keystore app/debug.keystore -storepass android \
            -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 \
            -validity 10000 -dname "CN=Android Debug,O=Android,C=US" >/dev/null 2>&1 || {
            log "ERROR" "Failed to generate debug keystore"
            return 1
        }
    fi

    log "INFO" "Project properties configured"
    return 0
}

# Main setup function
main() {
    log "INFO" "Starting MemoryReel Android development environment setup..."

    # Run setup steps
    check_prerequisites || return 1
    setup_android_sdk || return 1
    setup_project_properties || return 1

    # Verify Gradle wrapper
    if [ ! -f "gradlew" ]; then
        log "ERROR" "Gradle wrapper not found"
        return 1
    fi
    chmod +x gradlew

    # Run initial Gradle sync
    log "INFO" "Running initial Gradle sync..."
    ./gradlew wrapper >/dev/null 2>&1 || {
        log "ERROR" "Failed to sync Gradle wrapper"
        return 1
    }

    log "INFO" "Setup completed successfully"
    log "INFO" "Next steps:"
    log "INFO" "1. Run './gradlew assembleMobileDebug' for mobile app build"
    log "INFO" "2. Run './gradlew assembleTvDebug' for TV app build"
    log "INFO" "3. Use Android Studio to open the project"
    return 0
}

# Execute main function
main "$@"