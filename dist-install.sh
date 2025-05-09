#!/bin/bash

# Labs Volume Bot Installation Script
echo "
██╗      █████╗ ██████╗ ███████╗
██║     ██╔══██╗██╔══██╗██╔════╝
██║     ███████║██████╔╝███████╗
██║     ██╔══██║██╔══██╗╚════██║
███████╗██║  ██║██████╔╝███████║ \\
                       
Live AI Based Strategy
"

# Make sure we're in the right directory
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
cd "$SCRIPT_DIR"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install Node.js first (https://nodejs.org)"
    exit 1
fi

echo "🔍 Checking environment..."
echo "📂 Installation directory: $SCRIPT_DIR"

# Create .env file if it doesn't exist
ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
    echo -e "\n📝 Setting up configuration..."
    
    # Prompt for RPC URL
    echo -e "\n🔗 Please enter your Solana RPC URL (required)"
    echo "Example: https://api.mainnet-beta.solana.com"
    read -p "RPC URL: " rpc_url
    
    while [ -z "$rpc_url" ]; do
        echo "❌ RPC URL is required. Please enter a valid URL:"
        read -p "RPC URL: " rpc_url
    done
    
    # Prompt for secondary RPC URL
    echo -e "\n🔗 Please enter a secondary Solana RPC URL (optional, press Enter to skip)"
    echo "Example: https://api.mainnet-beta.solana.com"
    read -p "Secondary RPC URL: " rpc_url2
    
    # Prompt for OpenAI API key
    echo -e "\n🤖 Please enter your OpenAI API key (required for some features)"
    read -p "OpenAI API Key: " openai_key
    
    while [ -z "$openai_key" ]; do
        echo "❌ OpenAI API key is required. Please enter a valid key:"
        read -p "OpenAI API Key: " openai_key
    done
    
    # Prompt for license key
    echo -e "\n🔑 Please enter your license key (required, provided at purchase)"
    read -p "License Key: " license_key
    
    while [ -z "$license_key" ]; do
        echo "❌ License key is required. Please enter the license key provided with your purchase:"
        read -p "License Key: " license_key
    done
    
    # Create the .env file
    cat > "$ENV_FILE" << EOL
# Generated configuration
SOLANA_RPC="${rpc_url}"
EOL

    # Add secondary RPC if provided
    if [ -n "$rpc_url2" ]; then
        echo "SOLANA_RPC_2=\"${rpc_url2}\"" >> "$ENV_FILE"
    fi
    
    # Add OpenAI key
    echo "OPENAI_API_KEY=\"${openai_key}\"" >> "$ENV_FILE"
    
    # Add license key
    echo "LICENSE_KEY=\"${license_key}\"" >> "$ENV_FILE"
    
    echo "✅ Configuration saved to $ENV_FILE"
else
    echo "📄 Using existing .env configuration"
fi

# Check for license key if not already in env file
if [ ! -f "$ENV_FILE" ] || ! grep -q "LICENSE_KEY" "$ENV_FILE"; then
    echo -e "\n🔑 License setup"
    echo "A valid license key is required to use this software."
    echo "Please enter the license key provided with your purchase:"
    read -p "License key: " license_key
    
    while [ -z "$license_key" ]; do
        echo "❌ License key is required. Please enter the license key provided with your purchase:"
        read -p "License Key: " license_key
    done
    
    # Save to env file
    echo "LICENSE_KEY=\"${license_key}\"" >> "$ENV_FILE"
    echo "✅ License key added to .env file"
else
    echo "📄 Using existing license configuration"
fi

# Install dependencies
echo -e "\n📦 Installing dependencies..."
npm install --no-audit

echo "
✅ Installation complete!

To start the application, run:
  npm run labs

For help or support, contact support@koynlabs.com
" 