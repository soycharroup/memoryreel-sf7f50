#!/bin/bash

# MemoryReel iOS/tvOS Test Script
# Version: 1.0
# Executes comprehensive test suites for iOS and tvOS applications with parallel execution,
# error handling, and coverage reporting.

set -e
set -o pipefail

# Import environment variables and utilities
source "$(dirname "$0")/build.sh"

# Global variables from specification
WORKSPACE="MemoryReel.xcworkspace"
IOS_SCHEME="MemoryReel"
TVOS_SCHEME="MemoryReelTV"
TEST_OUTPUT_DIR="test_output"
COVERAGE_DIR="coverage"
MAX_RETRIES=3
PARALLEL_JOBS=4
TEST_TIMEOUT=3600
MIN_COVERAGE=80
LOG_LEVEL="INFO"

# Setup test environment with comprehensive validation
setup_test_environment() {
    local platform=$1
    local configuration=$2

    echo "Setting up test environment for $platform..."

    # Create output directories
    mkdir -p "${TEST_OUTPUT_DIR}/${platform}"
    mkdir -p "${COVERAGE_DIR}/${platform}"

    # Validate xcode installation
    if ! command -v xcodebuild &> /dev/null; then
        echo "Error: Xcode command line tools not found"
        exit 1
    fi

    # Validate test plans
    if [[ $platform == "ios" ]]; then
        if [ ! -f "MemoryReel.xctestplan" ]; then
            echo "Error: iOS test plan not found"
            exit 1
        fi
    else
        if [ ! -f "MemoryReelTV.xctestplan" ]; then
            echo "Error: tvOS test plan not found"
            exit 1
        fi
    fi

    # Setup test device
    if [[ $platform == "ios" ]]; then
        xcrun simctl boot "iPhone 14" || true
    else
        xcrun simctl boot "Apple TV 4K" || true
    fi

    return 0
}

# Execute iOS tests with parallel processing and retry logic
run_ios_tests() {
    local configuration=$1
    local enable_coverage=$2
    local parallel_jobs=$3

    echo "Running iOS tests..."

    local test_command="xcodebuild test \
        -workspace ${WORKSPACE} \
        -scheme ${IOS_SCHEME} \
        -testPlan MemoryReel \
        -destination 'platform=iOS Simulator,name=iPhone 14' \
        -parallel-testing-enabled YES \
        -parallel-testing-worker-count ${parallel_jobs} \
        -resultBundlePath ${TEST_OUTPUT_DIR}/ios/results.xcresult"

    if [[ $enable_coverage == true ]]; then
        test_command+=" -enableCodeCoverage YES"
    fi

    # Execute tests with retry logic
    local attempt=1
    while [ $attempt -le $MAX_RETRIES ]; do
        echo "Test attempt $attempt of $MAX_RETRIES"
        
        if eval "$test_command" | xcpretty; then
            echo "iOS tests passed on attempt $attempt"
            return 0
        fi

        ((attempt++))
        sleep 5
    done

    echo "Error: iOS tests failed after $MAX_RETRIES attempts"
    return 1
}

# Execute tvOS tests with specialized TV interface validation
run_tvos_tests() {
    local configuration=$1
    local enable_coverage=$2
    local parallel_jobs=$3

    echo "Running tvOS tests..."

    local test_command="xcodebuild test \
        -workspace ${WORKSPACE} \
        -scheme ${TVOS_SCHEME} \
        -testPlan MemoryReelTV \
        -destination 'platform=tvOS Simulator,name=Apple TV 4K' \
        -parallel-testing-enabled YES \
        -parallel-testing-worker-count ${parallel_jobs} \
        -resultBundlePath ${TEST_OUTPUT_DIR}/tvos/results.xcresult"

    if [[ $enable_coverage == true ]]; then
        test_command+=" -enableCodeCoverage YES"
    fi

    # Execute tests with retry logic
    local attempt=1
    while [ $attempt -le $MAX_RETRIES ]; do
        echo "Test attempt $attempt of $MAX_RETRIES"
        
        if eval "$test_command" | xcpretty; then
            echo "tvOS tests passed on attempt $attempt"
            return 0
        fi

        ((attempt++))
        sleep 5
    done

    echo "Error: tvOS tests failed after $MAX_RETRIES attempts"
    return 1
}

# Generate consolidated coverage report
generate_coverage_report() {
    local coverage_files=("$@")
    
    echo "Generating coverage report..."

    # Create coverage directory if it doesn't exist
    mkdir -p "$COVERAGE_DIR"

    # Merge coverage data
    xcrun xccov merge \
        "${TEST_OUTPUT_DIR}/ios/results.xcresult" \
        "${TEST_OUTPUT_DIR}/tvos/results.xcresult" \
        --outfile "${COVERAGE_DIR}/merged_coverage.xccovarchive"

    # Generate HTML report
    xcrun xccov view \
        --report \
        --json \
        "${COVERAGE_DIR}/merged_coverage.xccovarchive" > "${COVERAGE_DIR}/coverage.json"

    # Check coverage threshold
    local coverage_percentage=$(jq '.lineCoverage * 100' "${COVERAGE_DIR}/coverage.json")
    if (( $(echo "$coverage_percentage < $MIN_COVERAGE" | bc -l) )); then
        echo "Error: Code coverage ($coverage_percentage%) below minimum threshold ($MIN_COVERAGE%)"
        return 1
    fi

    return 0
}

# Cleanup test artifacts
cleanup_test_artifacts() {
    local output_dir=$1
    local archive_results=$2

    echo "Cleaning up test artifacts..."

    if [[ $archive_results == true ]]; then
        # Archive test results
        local archive_name="test_results_$(date +%Y%m%d_%H%M%S).tar.gz"
        tar -czf "$archive_name" "$TEST_OUTPUT_DIR" "$COVERAGE_DIR"
        echo "Test results archived to $archive_name"
    fi

    # Cleanup simulators
    xcrun simctl shutdown all
    xcrun simctl erase all

    # Remove temporary files
    rm -rf "$TEST_OUTPUT_DIR"
    rm -rf "$COVERAGE_DIR"
    rm -rf "DerivedData"

    return 0
}

# Main execution flow
main() {
    local start_time=$(date +%s)
    local exit_code=0

    echo "Starting test execution..."

    # Setup test environments
    setup_test_environment "ios" "Debug" || exit 1
    setup_test_environment "tvos" "Debug" || exit 1

    # Run iOS tests
    if ! run_ios_tests "Debug" true $PARALLEL_JOBS; then
        echo "iOS tests failed"
        exit_code=1
    fi

    # Run tvOS tests
    if ! run_tvos_tests "Debug" true $PARALLEL_JOBS; then
        echo "tvOS tests failed"
        exit_code=1
    fi

    # Generate coverage report if all tests passed
    if [ $exit_code -eq 0 ]; then
        if ! generate_coverage_report; then
            echo "Coverage report generation failed"
            exit_code=1
        fi
    fi

    # Calculate execution time
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    echo "Test execution completed in $duration seconds"

    # Cleanup
    cleanup_test_artifacts "$TEST_OUTPUT_DIR" true

    exit $exit_code
}

# Execute main if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi