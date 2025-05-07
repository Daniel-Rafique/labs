# Labs Volume Bot

A Solana automation tool for managing volume and engagement on pump.fun.

## Features

- **PumpFun Integration**: Automate interactions with pump.fun
- **Comment Management**: Post replies and manage engagement automatically
- **Volume Generation**: Create realistic trading volume patterns
- **Multi-Wallet Support**: Create and manage multiple Solana wallets
- **Token Monitoring**: Track new tokens and price movements
- **Automatic Transfers**: Efficiently move funds between wallets
- **Dust Collection**: Gather small balances from multiple wallets

## Requirements

Before installation, you'll need to have these items ready:

1. **Solana RPC URL** - A dedicated or public RPC endpoint for Solana
   - Example: `https://api.mainnet-beta.solana.com`
   - For better performance, consider a paid RPC provider like QuickNode or Helius

2. **OpenAI API Key** - Required for AI-driven content generation
   - Get one from [OpenAI Platform](https://platform.openai.com/api-keys)

3. **License Key** - Valid license for this software
   - Contact support@koynlabs.com to obtain a license key
   - A trial license can be generated during installation

## Installation

1. Extract this package to a directory of your choice
2. Install dependencies:
   ```bash
   npm install
   ```
   or use the provided installation scripts:
   ```bash
   # On macOS/Linux:
   ./install.sh
   
   # On Windows:
   install.bat
   ```

3. During installation, you will be prompted to:
   - Enter your Solana RPC URL
   - Provide your OpenAI API key
   - Enter your license key (or generate a trial)

4. Start the application:
   ```bash
   npm run labs
   ```

## Configuration

The application uses a `.env` file for configuration. You can edit this file directly if needed:

```
# Solana RPC endpoint
SOLANA_RPC_URL=https://your-rpc-url.com

# API keys
OPENAI_API_KEY=your-openai-key

# Optional settings
# OFFLINE_MODE=true  # Run without license verification
# AUTO_ACTIVATE=true # Automatically activate license on new machine
```

## Usage

The application provides an interactive CLI interface. After starting with `npm run labs`, you can:

- Create and manage Solana wallets
- Monitor token activity
- Post automated replies on pump.fun
- Start volume generation bots
- Distribute SOL between wallets
- Collect dust from multiple wallets

### Command Examples

```bash
# Start the bot with interactive menu
npm run labs

# Check wallet balances
npm run check-balances

# Create wallets
node dist/index.js create-wallets

# Post replies on pump.fun
node dist/index.js post-reply
```

## License

This software is provided under a commercial license. A valid license key is required for full functionality.

## Support

For questions, issues, or to obtain a license, please contact support@koynlabs.com
