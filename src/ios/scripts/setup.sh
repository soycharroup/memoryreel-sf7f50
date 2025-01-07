#!/bin/bash

# MemoryReel iOS/tvOS Development Environment Setup Script
# Version: 1.0.0
# Required: Xcode 14.0+, Ruby 3.0.0+, CocoaPods 1.12.1+

# Exit on any error
set -e

# Global variables
REQUIRED_XCODE_VERSION="14.0"
REQUIRED_RUBY_VERSION="3.0.0"
REQUIRED_COCOAPODS_VERSION="1.12.1"
PROJECT_ROOT="$(pwd)"
MIN_DISK_SPACE="10G"
TEMP_DIR="$(mktemp -d)"
LOG_FILE="${TEMP_DIR}/setup.log"

# Logging setup
exec 1> >(tee -a "$LOG_FILE")
exec 2> >(tee -a "$LOG_FILE" >&2)

# Print banner
echo "======================================"
echo "MemoryReel Development Environment Setup"
echo "======================================"
echo "Starting setup at $(date)"
echo ""

# Check system requirements
check_system_requirements() {
    echo "Checking system requirements..."
    
    # Check available disk space
    available_space=$(df -h . | awk 'NR==2 {print $4}')
    if [[ ${available_space%G} -lt ${MIN_DISK_SPACE%G} ]]; then
        echo "Error: Insufficient disk space. Required: $MIN_DISK_SPACE, Available: $available_space"
        return 1
    fi
    
    # Check write permissions
    if [[ ! -w "$PROJECT_ROOT" ]]; then
        echo "Error: No write permission in project directory"
        return 1
    }
    
    # Check network connectivity
    if ! ping -c 1 github.com &> /dev/null; then
        echo "Error: No network connectivity"
        return 1
    }
    
    echo "System requirements check passed"
    return 0
}

# Check Xcode installation
check_xcode() {
    echo "Checking Xcode installation..."
    
    # Check if Xcode is installed
    if ! xcode-select -p &> /dev/null; then
        echo "Error: Xcode not found"
        return 1
    }
    
    # Check Xcode version
    xcode_version=$(xcodebuild -version | grep "Xcode" | cut -d' ' -f2)
    if [[ "${xcode_version%%.*}" -lt "${REQUIRED_XCODE_VERSION%%.*}" ]]; then
        echo "Error: Xcode version $REQUIRED_XCODE_VERSION or higher is required"
        return 1
    }
    
    # Check command line tools
    if ! xcode-select --install 2>/dev/null; then
        echo "Xcode command line tools are already installed"
    fi
    
    # Accept Xcode license if needed
    sudo xcodebuild -license accept
    
    echo "Xcode check passed"
    return 0
}

# Setup Ruby environment
setup_ruby() {
    echo "Setting up Ruby environment..."
    
    # Install rbenv if not present
    if ! command -v rbenv &> /dev/null; then
        brew install rbenv
        eval "$(rbenv init -)"
    fi
    
    # Install required Ruby version
    if ! rbenv versions | grep -q "$REQUIRED_RUBY_VERSION"; then
        rbenv install "$REQUIRED_RUBY_VERSION"
    fi
    
    # Set local Ruby version
    rbenv local "$REQUIRED_RUBY_VERSION"
    
    # Install bundler
    gem install bundler
    
    echo "Ruby environment setup complete"
    return 0
}

# Install and configure CocoaPods
install_cocoapods() {
    echo "Installing CocoaPods..."
    
    # Install specific CocoaPods version
    gem install cocoapods -v "$REQUIRED_COCOAPODS_VERSION"
    
    # Verify installation
    if ! pod --version &> /dev/null; then
        echo "Error: CocoaPods installation failed"
        return 1
    fi
    
    # Setup CocoaPods repo
    pod repo update
    
    echo "CocoaPods installation complete"
    return 0
}

# Setup workspace
setup_workspace() {
    echo "Setting up Xcode workspace..."
    
    # Clean existing Pods directory
    if [[ -d "${PROJECT_ROOT}/ios/Pods" ]]; then
        rm -rf "${PROJECT_ROOT}/ios/Pods"
    fi
    
    # Install pods
    cd "${PROJECT_ROOT}/ios"
    pod install
    
    # Verify workspace creation
    if [[ ! -d "${PROJECT_ROOT}/ios/MemoryReel.xcworkspace" ]]; then
        echo "Error: Workspace creation failed"
        return 1
    }
    
    echo "Workspace setup complete"
    return 0
}

# Setup development certificates
setup_certificates() {
    echo "Setting up development certificates..."
    
    # Check for existing certificates
    if ! security find-identity -v -p codesigning &> /dev/null; then
        echo "Warning: No development certificates found"
        echo "Please install development certificates manually through Xcode"
    fi
    
    # Setup automatic signing
    defaults write com.apple.dt.Xcode IDEProvisioningTeamIDOverride -string "AUTO"
    
    echo "Certificate setup complete"
    return 0
}

# Cleanup function
cleanup() {
    echo "Performing cleanup..."
    
    # Remove temporary directory
    rm -rf "$TEMP_DIR"
    
    # Archive logs
    if [[ -f "$LOG_FILE" ]]; then
        mv "$LOG_FILE" "${PROJECT_ROOT}/setup_$(date +%Y%m%d_%H%M%S).log"
    fi
    
    echo "Cleanup complete"
    return 0
}

# Main execution
main() {
    # Trap cleanup on exit
    trap cleanup EXIT
    
    # Run setup steps
    check_system_requirements || exit 1
    check_xcode || exit 1
    setup_ruby || exit 1
    install_cocoapods || exit 1
    setup_workspace || exit 1
    setup_certificates || exit 1
    
    echo ""
    echo "======================================"
    echo "Setup completed successfully!"
    echo "You can now open MemoryReel.xcworkspace"
    echo "======================================"
    
    return 0
}

# Execute main function
main