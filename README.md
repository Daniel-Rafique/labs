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

3. Start the application:
   ```bash
   npm run labs
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
