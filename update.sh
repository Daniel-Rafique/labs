#!/bin/bash

# LABS Update Script
# This script updates the application while preserving user settings

echo "==============================================="
echo "LABS Update Tool"
echo "==============================================="
echo "This tool will update your LABS application while preserving your settings."
echo

# Check if the .config directory exists
if [ ! -d ".config" ]; then
  echo "Error: .config directory not found."
  echo "Are you running this in your existing LABS installation directory?"
  exit 1
fi

# Check if .env exists
if [ ! -f ".env" ]; then
  echo "Warning: .env file not found."
  echo "Your environment settings might not be preserved."
fi

# Create backup directory
BACKUP_DIR="./backup_$(date +%Y%m%d_%H%M%S)"
echo "Creating backup directory: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

# Backup config files
echo "Backing up your configuration..."
cp -r .config "$BACKUP_DIR/"
if [ -f ".env" ]; then
  cp .env "$BACKUP_DIR/"
fi

# Get the current directory name
CURRENT_DIR=$(basename "$PWD")
PARENT_DIR=$(dirname "$PWD")
UPDATE_DIR="$PARENT_DIR/${CURRENT_DIR}_update"

echo "Creating temporary update directory: $UPDATE_DIR"
mkdir -p "$UPDATE_DIR"

# Ask for update zip file
echo
echo "Please specify the path to the update ZIP file:"
read -p "> " UPDATE_ZIP

if [ ! -f "$UPDATE_ZIP" ]; then
  echo "Error: Update file not found at $UPDATE_ZIP"
  echo "Update canceled."
  rm -rf "$UPDATE_DIR"
  exit 1
fi

# Extract update to temporary directory
echo "Extracting update files..."
unzip -q "$UPDATE_ZIP" -d "$UPDATE_DIR"

# Count files in update directory
UPDATE_FILES=$(find "$UPDATE_DIR" -type f | wc -l)
if [ "$UPDATE_FILES" -lt 10 ]; then
  echo "Error: The extracted update appears to be incomplete (only $UPDATE_FILES files found)."
  echo "Update canceled."
  rm -rf "$UPDATE_DIR"
  exit 1
fi

# Check if it's a valid LABS installation
if [ ! -f "$UPDATE_DIR/package.json" ]; then
  echo "Error: The update does not appear to be a valid LABS installation."
  echo "Update canceled."
  rm -rf "$UPDATE_DIR"
  exit 1
fi

echo
echo "Ready to update. This will:"
echo "1. Copy your config files to the new version"
echo "2. Install any new dependencies"
echo "3. Replace your current installation with the update"
echo
echo "Your current installation will be backed up to: $BACKUP_DIR"
echo

read -p "Continue with update? (y/n): " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Update canceled."
  rm -rf "$UPDATE_DIR"
  exit 0
fi

# Copy config files to update directory
echo "Copying your configuration to the new version..."
if [ -d ".config" ]; then
  cp -r .config "$UPDATE_DIR/"
fi
if [ -f ".env" ]; then
  cp .env "$UPDATE_DIR/"
fi

# Install dependencies in update directory
echo "Installing dependencies for the new version..."
cd "$UPDATE_DIR"
npm install --quiet

if [ $? -ne 0 ]; then
  echo "Error: Failed to install dependencies."
  echo "Update canceled."
  exit 1
fi

cd "$PARENT_DIR"

# Rename directories to complete the update
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mv "$CURRENT_DIR" "${CURRENT_DIR}_old_$TIMESTAMP"
mv "${CURRENT_DIR}_update" "$CURRENT_DIR"

echo
echo "==============================================="
echo "Update Complete!"
echo "==============================================="
echo "The new version has been installed with your existing configuration."
echo "Your previous installation has been renamed to: ${CURRENT_DIR}_old_$TIMESTAMP"
echo
echo "You can now run the application with: cd $CURRENT_DIR && npm run labs"
echo
echo "If you encounter any issues, your backup is available at: $BACKUP_DIR"
echo "===============================================" 