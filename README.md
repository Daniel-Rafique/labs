# Labs Volume Bot

A Solana automation tool for managing volume and engagement on pump.fun with AI-enhanced trading optimization and residential proxy support.

## Features

- **PumpFun Integration**: Automate interactions with pump.fun
- **Comment Management**: Post replies and manage engagement automatically
- **Volume Generation**: Create realistic trading volume patterns
- **Multi-Wallet Support**: Create and manage multiple Solana wallets
- **Token Monitoring**: Track new tokens and price movements
- **Automatic Transfers**: Efficiently move funds between wallets
- **Dust Collection**: Gather small balances from multiple wallets
- **Token Creation**: Create and launch tokens on pump.fun using your existing wallets
- **AI-Enhanced Trading**: Optimize trading parameters using real-time market analysis
- **Adaptive Parameters**: Automatically adjust trade amounts, timing, and strategies based on token metrics
- **Market Analytics**: Fetch and analyze token liquidity, price, and volume data
- **Performance Tracking**: Save optimization data for historical analysis
- **Residential Proxies**: Route trades through different IPs for more organic trading patterns
  - Geographic distribution across multiple countries
  - Consistent IP identity per wallet
  - Automatic IP rotation and freshness tracking
  - Oxylabs integration

## Requirements

Before installation, you'll need to have these items ready:

1. **Solana RPC URL** - A dedicated or public RPC endpoint for Solana
   - Example: `https://api.mainnet-beta.solana.com`
   - For better performance, consider a paid RPC provider like QuickNode or Helius

2. **OpenAI API Key** - Required for AI-driven content generation and trading parameter optimization
   - Get one from [OpenAI Platform](https://platform.openai.com/api-keys)

3. **License Key** - Valid license for this software
   - Contact support@koynlabs.com to obtain a license key
   - A trial license can be generated during installation

4. **Proxy Service** (Optional but Recommended) - For residential IP rotation
   - Supported providers: Oxylabs residential proxies
   - Makes trading appear more organic with different IP addresses
   - Prevents platform detection of multiple trades from same IP
   - Avoids rate limiting and anti-bot measures

## Installation

### Fresh Installation

1. Download and extract the ZIP package to a directory of your choice
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

3. During first-time installation, you will be guided through the setup process:
   - Enter your Solana RPC URL
   - Provide your OpenAI API key
   - Enter your license key (or generate a trial)
   - Create initial wallets if needed

4. Start the application:
   ```bash
   npm run labs
   ```

### Installation After Update

If you're updating from a previous version:

1. For the easiest update process, use our update scripts:
   ```bash
   # On macOS/Linux:
   ./update.sh
   
   # On Windows:
   update.bat
   ```
   These scripts will:
   - Backup your current configuration
   - Extract the new version
   - Copy your settings to the new version
   - Install dependencies
   - Replace the old version with the new one

2. Alternatively, you can manually update:
   - Download and extract the new ZIP package to a new directory
   - Copy your `.env` and `.config` directory from your old installation to the new installation directory
   - Install dependencies with `npm install`
   - Start the application with `npm run labs`

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
# USE_AI_OPTIMIZATION=true # Enable AI trading parameter optimization
# USE_PROXIES=true # Enable proxy support for trading
```

Your wallets and settings are stored in the `.config` directory. This directory contains:
- `wallets.json` - Your Solana wallet keypairs
- `license.json` - Your active license information
- `optimizations/` - AI trading optimization history and data
- `proxies.json` - Proxy configuration settings
- Other configuration files

## Using the AI Trading Bot

The AI-enhanced trading bot uses real-time market data and machine learning to optimize trading parameters for maximum effectiveness.

### Starting the Trading Bot

To start the AI trading bot:

```bash
# Run with TypeScript
npm run trade-bot

# Or use the built version
npm run trade-bot:build

# Or start through the main CLI
npm run start-bot
```

### Trading Bot Configuration

When starting the bot, you'll be guided through a setup process where you can:

1. Set the token contract address to trade
2. Choose between JITO mode or Lightning/Bump mode
3. Enable or disable AI parameter optimization
4. Enable or disable residential proxy support
5. Set trading parameters:
   - Maximum trade amount (in SOL)
   - Minimum trade amount (in SOL)
   - Time between buys (in milliseconds)
   - Number of buys before selling
   - Number of cycles to perform

### AI Optimization

When AI optimization is enabled:

1. The bot fetches token metrics from DexScreener API every 5 minutes, including:
   - Price and 24h price change
   - Liquidity and volume
   - Volatility and market trends

2. These metrics are analyzed to recommend optimal trading parameters

3. Optimization data is saved to `.config/optimizations/` for historical analysis

4. Trading parameters are automatically adjusted based on market conditions

You can enable AI optimization by:
- Setting `USE_AI_OPTIMIZATION=true` in your `.env` file
- Selecting "Yes" when prompted during bot startup
- Including the `--useAi` flag when starting the bot programmatically

## Residential Proxy Support

The application provides advanced residential proxy support to make your trading and engagement activity appear natural and organic by rotating IPs across different geographic locations.

### Setting Up Proxies

```bash
# Configure proxies through the interactive UI
npm run labs
# Then select "Setup Proxies" from the main menu

# Or use the direct command
npm run setup-proxy
```

### Oxylabs Residential Proxies

Oxylabs residential proxies are fully integrated and recommended for the best results:

1. Select "Configure Oxylabs Residential Proxies" from the setup menu
2. Enter your Oxylabs username and password (without the "customer-" prefix)
3. Test the connection to ensure everything works correctly
4. Verify country-specific routing and IP rotation

### Advanced Proxy Features

When proxies are enabled, the bot implements these advanced features:

1. **Wallet-to-IP Consistency**: Each wallet gets assigned a dedicated proxy session ID based on its public key, ensuring consistent IP identity across operations
2. **Geographic Distribution**: Operations are automatically routed through proxies in different countries (US, UK, Germany, France, etc.) to appear as organic global activity
3. **IP Freshness Tracking**: The system tracks which IPs have been used recently and ensures new operations use fresh IPs
4. **Automatic Rotation**: IPs are automatically rotated between operations to prevent pattern detection
5. **Fallback Mechanism**: If proxy connections fail, the system can gracefully continue without proxies
6. **Session Management**: Uses Oxylabs' session control for consistent IP assignment per wallet

### Proxy Support For All Operations

The proxy system is integrated with all operations in the application:

1. **Trading**: Route trades through different IPs to appear more organic
2. **Profile Creation**: Create PumpFun profiles with diverse IP signatures
3. **Comment Posting**: Post comments from different global locations
4. **Token Creation**: Create tokens with full proxy support
5. **API Interactions**: All API calls use the proxy system when enabled

### Testing Your Proxy Configuration

The proxy setup includes comprehensive testing features:
- Test basic connectivity to verify credentials
- Test IP rotation to ensure different IPs are being assigned
- Test country-specific routing to verify geographic distribution

You can enable proxy support by:
- Setting `USE_PROXIES=true` in your `.env` file
- Configuring proxies through the setup menu
- The proxy system will be enabled automatically if valid proxy credentials are found

## First-Time Setup

When running the application for the first time, you'll go through these steps:

1. **Environment Configuration**: You'll be prompted to enter your RPC URL and API keys
2. **License Activation**: You'll verify your license key or create a trial
3. **Wallet Creation**: You'll be guided to create your initial wallets
4. **Interactive Menu**: You'll access the main application features

This process only needs to be completed once. On subsequent runs, your settings will be loaded automatically.

## Usage

The application provides an interactive CLI interface. After starting with `npm run labs`, you can:

- Create and manage Solana wallets
- Monitor token activity
- Post automated replies on pump.fun
- Start volume generation bots
- Distribute SOL between wallets
- Collect dust from multiple wallets
- Create new tokens on pump.fun
- Start AI-enhanced trading bots
- Configure residential proxies

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

# Create a new token
node dist/index.js create-token

# Start trading bot with AI optimization and proxies
node dist/index.js start-bot --useAi --useProxies

# Configure proxy settings
node dist/index.js setup-proxy
```

## License

This software is provided under a commercial license. A valid license key is required for full functionality.

## Support

For questions, issues, or to obtain a license, please contact support@koynlabs.com

## Creating Pump.fun Profiles

The application includes a powerful profile creation utility that can automatically generate and set up PumpFun profiles for your wallets.

### Profile Creation Features

```bash
# Create profiles through the CLI
npm run create-profiles

# Or use the direct command
npm run labs create-profiles
```

Features of the profile creator:

1. **Bulk Creation**: Create profiles for multiple wallets in a single operation
2. **AI-Generated Content**: Option to use OpenAI to generate unique usernames and bios
3. **Random Usernames**: Generate crypto-themed usernames automatically
4. **Profile Images**: Option to upload profile pictures from your img/ directory
5. **Proxy Support**: Route profile creation through different IPs for more organic setup
   - Uses the same residential proxy system as trading
   - Assigns consistent proxy sessions to wallets
   - Prevents detection of bulk profile creation
   - Automatically rotates IPs to avoid rate limiting
   - Handles proxy connection errors gracefully

### Using the Profile Creator

When running the profile creator, you'll be guided through several options:

1. Select your wallet file (defaults to .config/wallets.json)
2. Choose whether to use residential proxies (if configured)
3. Choose whether to use AI for generating usernames and bios
4. Optionally provide OpenAI API key for content generation
5. Decide whether to upload profile images
6. For non-AI mode, choose custom or random usernames and bios

The profile creator will then:
- Create accounts on pump.fun for each wallet
- Generate unique usernames and bios (random or AI-generated)
- Upload profile images if requested
- Verify profile creation was successful
- Provide a summary of successful and failed profiles
