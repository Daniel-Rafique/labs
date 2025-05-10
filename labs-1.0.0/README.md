# labs v1.0.0

A Solana automation tool for managing volume and engagement on pump.fun.

## Features

- **PumpFun Integration**: Automate interactions with pump.fun
- **Comment Management**: Post replies and manage engagement automatically
- **Volume Generation**: Create realistic trading volume patterns
- **Multi-Wallet Support**: Create and manage multiple Solana wallets
- **Token Monitoring**: Track new tokens and price movements
- **Automatic Transfers**: Efficiently move funds between wallets
- **Dust Collection**: Gather small balances from multiple wallets

## Quick Start

1. Extract this package to a directory of your choice
2. Install dependencies:
   ```bash
   npm install
   ```
   or run the provided installation script:
   ```bash
   # On macOS/Linux:
   ./install.sh
   
   # On Windows:
   install.bat
   ```

3. Start the application:
   ```bash
   npm run labs
   ```

## Usage

The application provides an interactive CLI interface with multiple options for volume generation, comment automation, and wallet management.

## License

This software requires a valid license key. Please place your license key in the license.key file or set the LICENSE_KEY environment variable.

## Support

For questions, issues, or to obtain a license, please contact support@koynlabs.com

// Create a sample .env file example
console.log('📝 Creating env-example file...');
fs.writeFileSync('./env-example', 
  '# Labs Volume Bot Configuration
' +
  '# Replace these example values with your actual credentials

' +
  '# Required: Primary Solana RPC URL (Get one from QuickNode, Helius, Alchemy, etc.)
' +
  'SOLANA_RPC=https://api.mainnet-beta.solana.com

' +
  '# Secondary Solana RPC URL for redundancy
' +
  'SOLANA_RPC_2=https://api.mainnet-beta.solana.com

' +
  '# Required: OpenAI API Key for AI-generated comments and profiles
' +
  '# Get one from: https://platform.openai.com/api-keys
' +
  'OPENAI_API_KEY=your-openai-api-key-here

' +
  '# Required: License key for accessing all features
' +
  '# This key is provided with your purchase
' +
  'LICENSE_KEY=your-license-key-here

' +
  '# Trading configuration (set by startBot command)
' +
  'CONTRACT_ADDRESS=
' +
  'TOKEN_MINT_ADDRESS=
' +
  'TOKEN_SYMBOL=TOKEN
' +
  'MAX_TRADE_AMOUNT=0.005
' +
  'MIN_TRADE_AMOUNT=0.0005
' +
  'TIME_BETWEEN_BUYS=5000
' +
  'NUMBER_OF_BUYS=3
' +
  'NUMBER_OF_CYCLES=1
' +
  'JITO=false
' +
  'ENABLE_TRADING=true
' +
  'TRADE_TYPE=sol_spl

' +
  '# Optional: Set to "true" to enable debug logging
' +
  'DEBUG=false

' +
  '# Optional: Set to "true" for offline mode (limited license validation)
' +
  '# OFFLINE_MODE=false

' +
  '# Optional: Set to "true" to automatically activate license on new machines
' +
  '# AUTO_ACTIVATE=false

' +
  '# Optional: Default configuration directory (default: .config)
' +
  '# CONFIG_DIR=.config');
