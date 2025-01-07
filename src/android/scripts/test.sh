#!/bin/bash

# MemoryReel Android Test Suite Runner v1.0.0
# Comprehensive test automation script for Android mobile and TV applications
# Dependencies:
# - gradle 7.4.2
# - android-platform-tools (latest)
# - mockk 1.12.0

set -e

# Global configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
readonly TEST_REPORT_DIR="./app/build/reports/tests"
readonly COVERAGE_REPORT_DIR="./app/build/reports/coverage"
readonly PERFORMANCE_REPORT_DIR="./app/build/reports/performance"
readonly AI_TEST_DATA_DIR="./app/src/androidTest/resources/ai_test_data"
readonly MAX_RESPONSE_TIME_MS=2000
readonly MIN_AI_ACCURACY=98

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m'

# Function to print colored output
log() {
    local level=$1
    local message=$2
    case $level in
        "INFO") echo -e "${GREEN}[INFO]${NC} $message" ;;
        "WARN") echo -e "${YELLOW}[WARN]${NC} $message" ;;
        "ERROR") echo -e "${RED}[ERROR]${NC} $message" ;;
    esac
}

# Function to check environment setup
check_environment() {
    local platform=$1
    
    # Check ANDROID_HOME
    if [ -z "$ANDROID_HOME" ]; then
        log "ERROR" "ANDROID_HOME is not set"
        return 1
    fi

    # Check Java version
    if ! java -version 2>&1 | grep -q "version \"11"; then
        log "ERROR" "Java 11 is required"
        return 1
    fi

    # Check Gradle version
    if ! ./gradlew --version | grep -q "Gradle 7.4"; then
        log "ERROR" "Gradle 7.4.2+ is required"
        return 1
    }

    # Check system memory
    local available_memory=$(free -g | awk '/^Mem:/{print $7}')
    if [ "$available_memory" -lt 4 ]; then
        log "ERROR" "Insufficient memory. 4GB minimum required"
        return 1
    }

    # Check AI test data
    if [ ! -d "$AI_TEST_DATA_DIR" ]; then
        log "ERROR" "AI test data directory not found"
        return 1
    }

    # Platform-specific checks
    if [ "$platform" = "tv" ]; then
        if ! which input-simulator >/dev/null; then
            log "ERROR" "TV input simulator not found"
            return 1
        }
    fi

    return 0
}

# Function to run unit tests
run_unit_tests() {
    local platform=$1
    local test_type=$2
    
    log "INFO" "Running unit tests for $platform platform"
    
    # Configure test environment
    export PLATFORM=$platform
    export TEST_TYPE=$test_type

    # Initialize performance monitoring
    mkdir -p "$PERFORMANCE_REPORT_DIR"
    
    # Execute tests with coverage
    ./gradlew :app:test${platform^}DebugUnitTest \
        -PtestCoverageEnabled=true \
        --max-workers=4 \
        --continue || return 1

    # Validate response times
    if ! grep -q "\"maxResponseTime\": { \"value\": $MAX_RESPONSE_TIME_MS }" \
        "$TEST_REPORT_DIR/$platform/debug/performance.json"; then
        log "ERROR" "Response time threshold exceeded"
        return 1
    fi

    return 0
}

# Function to run instrumented tests
run_instrumented_tests() {
    local platform=$1
    local test_type=$2
    
    log "INFO" "Running instrumented tests for $platform platform"

    # Check for connected devices
    local devices=$(adb devices | grep -v "List" | grep "device$")
    if [ -z "$devices" ]; then
        log "INFO" "No physical devices found, starting emulator"
        start_emulator "$platform"
    fi

    # Configure network conditions
    adb shell "svc wifi enable"
    adb shell "svc data enable"

    # TV-specific setup
    if [ "$platform" = "tv" ]; then
        configure_tv_input_simulation
    fi

    # Run instrumented tests
    ./gradlew :app:connected${platform^}DebugAndroidTest \
        -PtestCoverageEnabled=true \
        --max-workers=4 \
        --continue || return 1

    return 0
}

# Function to start appropriate emulator
start_emulator() {
    local platform=$1
    local avd_name

    if [ "$platform" = "tv" ]; then
        avd_name="Android_TV_1080p"
    else
        avd_name="Pixel_4_API_33"
    fi

    # Start emulator in background
    $ANDROID_HOME/emulator/emulator -avd $avd_name -no-window -no-audio &
    
    # Wait for emulator to boot
    adb wait-for-device
    while [ "$(adb shell getprop sys.boot_completed 2>/dev/null)" != "1" ]; do
        sleep 2
    done
}

# Function to configure TV input simulation
configure_tv_input_simulation() {
    # Initialize TV input simulator
    adb shell input keyevent KEYCODE_HOME
    sleep 2
}

# Function to generate comprehensive reports
generate_reports() {
    local test_type=$1
    local platform=$2
    
    log "INFO" "Generating test reports for $platform platform"

    # Create report directories
    mkdir -p "$TEST_REPORT_DIR/$platform"
    mkdir -p "$COVERAGE_REPORT_DIR/$platform"
    mkdir -p "$PERFORMANCE_REPORT_DIR/$platform"

    # Generate HTML reports
    ./gradlew :app:jacocoTestReport${platform^}DebugUnitTest
    
    # Generate performance reports
    ./gradlew :app:generatePerformanceReport${platform^}

    # Generate AI accuracy metrics if applicable
    if [ "$test_type" = "ai" ] || [ "$test_type" = "all" ]; then
        validate_ai_accuracy
    fi

    # Archive test artifacts
    tar -czf "test-artifacts-$platform.tar.gz" \
        "$TEST_REPORT_DIR/$platform" \
        "$COVERAGE_REPORT_DIR/$platform" \
        "$PERFORMANCE_REPORT_DIR/$platform"
}

# Function to validate AI accuracy
validate_ai_accuracy() {
    local accuracy=$(jq '.accuracy' "$TEST_REPORT_DIR/ai_metrics.json")
    if (( $(echo "$accuracy < $MIN_AI_ACCURACY" | bc -l) )); then
        log "ERROR" "AI accuracy below threshold: $accuracy% (minimum: $MIN_AI_ACCURACY%)"
        return 1
    fi
    return 0
}

# Main execution function
main() {
    local platform=${1:-"mobile"}
    local test_type=${2:-"all"}

    log "INFO" "Starting test suite for $platform platform (type: $test_type)"

    # Validate environment
    if ! check_environment "$platform"; then
        log "ERROR" "Environment check failed"
        exit 1
    fi

    # Run tests based on type
    case $test_type in
        "unit")
            run_unit_tests "$platform" "$test_type"
            ;;
        "instrumented")
            run_instrumented_tests "$platform" "$test_type"
            ;;
        "all")
            run_unit_tests "$platform" "$test_type" && \
            run_instrumented_tests "$platform" "$test_type"
            ;;
        *)
            log "ERROR" "Invalid test type: $test_type"
            exit 1
            ;;
    esac

    # Generate reports
    generate_reports "$test_type" "$platform"

    log "INFO" "Test suite completed successfully"
}

# Script entry point
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    main "$@"
fi