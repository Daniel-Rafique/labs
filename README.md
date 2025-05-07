# 🚀 Solana Advanced Trading Framework 🤖

A high-performance, multi-threaded framework for advanced trading on Solana DEXes, featuring sniping, copytrading, and limit orders. This bot utilizes the Solana Swap API from BloxRoute [https://bloxroute.com/](https://bloxroute.com/)

## ✨ Features

- 🏦 Supports multiple DEXes:
  - Raydium
  - Raydium CPMM
  - Pump.fun
  - Jupiter (Private Self-Hosted API)
- 👛 Multi-wallet support
- 🚄 Parallel execution with multiple threads
- ⏱️ Configurable delays for buying and selling
- 🔄 Option to use regular transactions or Jito for transaction processing
- 📊 Detailed logging with timestamps and color-coded actions
- 🎯 Sniper for new token launches:
  - Raydium
  - Pump.fun
- ⚡ Lightning-fast copytrading
- 📈 Limit orders for USDC to SOL trading
- 📊 Volume generation capabilities

## 🛠️ Prerequisites

- Node.js (v14 or later recommended)
- npm (comes with Node.js)
- PM2 (install globally with `npm install -g pm2`)
- One or multiple Solana wallets with SOL

## 🔧 Installation & Setup

1. Clone the repository:
   git clone https://github.com/Daniel-Rafique/solana-market-maker
   cd solana-market-maker

2. Install dependencies:
   npm install

3. Make the instance creation script executable:
   chmod +x copyInstance.sh

4. Create instances:
   ./copyInstance.sh

This will create the following trading instances:

- copytrade
- pumpfun
- moonshot
- ray

3. Create a `.env` file in the root directory and add your configuration:
   - `AMOUNT=0.1`
   - `TOKEN_ADDRESS=your_token_address`
   - `DELAY=2000`
   - `SELL_DELAY=1000`
   - `SLIPPAGE=1`
   - `PRIORITY_FEE=0.0005`
   - `JITO=false`
   - `RPC_URL=your_rpc_url`
   - `THREADS=2`

## 🚀 Usage

Run the bot with:

npm start

To use specific features, use the following settings in your `.env` file:

- 🎯 Sniping: `TRADE_TYPE=pumpfun || TRADE_TYPE=raydium`
- ⚡ Copytrading: `TRADE_TYPE=copytrade`
- 📈 Limit orders: `TRADE_TYPE=sol_spl || TRADE_TYPE=usdc_sol`

## ⚙️ Configuration

Adjust the settings in your `.env` file to customize the bot's behavior:

- AMOUNT: The amount of SOL to swap in each transaction
- TOKEN_ADDRESS: The address of the token you're trading
- DELAY: Delay between swap cycles (in milliseconds)
- SELL_DELAY: Delay between buy and sell operations (in milliseconds)
- SLIPPAGE: Maximum allowed slippage (in percentage)
- PRIORITY_FEE: Priority fee for transactions
- JITO: Set to "true" to use Jito for transaction processing
- RPC_URL: Your Solana RPC URL
- THREADS: Number of parallel threads to run

### 🎯 Pump Detection Parameters

- MIN_BUY_VOLUME_USD: Minimum trading volume in USD
- MINIMUM_BUY_RATIO: Required buy vs total volume ratio (e.g., 0.95 for 95% buys)
- MAXIMUM_SELLERS: Maximum allowed sellers during pump detection
- MINIMUM_TRADES: Minimum number of trades required for pump detection

### Other Settings

- SNIPER_TARGETS: Addresses of new tokens to snipe (comma-separated)
- COPYTRADE_WALLETS: Addresses of wallets to copy trades from (comma-separated)
- LIMIT_ORDER_PRICE: Price at which to execute USDC to SOL limit orders
- TRADE_TYPE: Type of trade to execute (pumpfun, copytrade, sol_spl, usdc_sol)

## 💰 API Usage and Fees

This bot uses the Solana Swap API from [https://bloxroute.com//](https://bloxroute.com/).

**Note**: The Swap API charges a fee for usage:

- Standard fee: 0.5% on each successful transaction
- For high-volume users: Fees can be reduced to as low as 0.1% (subject to approval)

For high-volume usage or inquiries about reduced fees, please contact:

- 💬 Discord: [koynlabs Discord](https://discord.gg/JH2e9rR9fc)
- 📧 Email: koynlabs@gmail.com

## ⚠️ Disclaimer

This bot is for educational and research purposes only. We do not recommend the use of trading bots or engage in market manipulation. Use at your own risk. Always understand the code you're running and the potential financial and legal implications of automated trading.

## 📜 License

[MIT License](LICENSE)

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check [issues page](https://github.com/Daniel-Rafique/solana-market-maker/issues).

## 🌟 Support

If you like this project, please consider giving it a ⭐️ on GitHub!

# Koyn Labs - Solana Trading Tool

A high-performance, multi-threaded framework for advanced trading on Solana DEXes, featuring wallet management, balance monitoring, and portfolio tracking.

## Features

### Wallet Management
- Create and manage Solana wallets
- Support for Lightning/Bump mode and JITO mode
- Wallet file storage in `.config` directory by default

### Balance & Portfolio Tools
- **NEW!** Wallet Dashboard - View comprehensive summary of all your wallets
- **NEW!** Wallet Monitor - Real-time monitoring of wallet balance changes
- Check SOL and token balances across multiple wallets
- Export wallet data to CSV for further analysis

### Fund Management
- Distribute SOL to multiple wallets
- Transfer SOL and tokens between wallets
- Dust collection with token selling capabilities

### Profile Management
- Create PumpFun profiles for wallets

## Usage

### Interactive Menu
The easiest way to use Koyn Labs is via the interactive menu:

```bash
npm run labs
```

This will present you with a user-friendly menu to access all features.

### Command Line Interface

You can also use the command line interface:

```bash
# Create wallets
npm run labs:cmd create-wallets -n 5

# View wallet dashboard
npm run dashboard

# Monitor wallet balances for changes
npm run monitor -i 30 -t 5 -u 120

# Check balances
npm run labs:cmd check-balances -t

# Distribute SOL
npm run labs:cmd distribute -a 0.05

# Collect dust
npm run labs:cmd dust -a 0.001
```

## Configuration

The application uses a `.env` file for configuration. A template is provided in `.env-template`.

## Wallet Modes

The application supports two wallet modes:

1. **JITO Mode** - Standard wallet functionality
2. **Lightning/Bump Mode** - Enhanced functionality with API key integration

## New Features (v1.1.0)

### Wallet Dashboard
An at-a-glance view of your wallet portfolio showing:
- Total and average SOL balances across all wallets
- Token holdings summary
- Top wallets by balance
- SOL balance distribution chart
- CSV export for external analysis

### Wallet Monitor
Real-time monitoring of your wallets:
- Define custom check intervals
- Set alert thresholds for balance changes
- Monitor for new tokens or removed tokens
- Configurable monitoring duration

## Post Replies Feature

The Post Replies feature allows you to automatically post comments on any Pump.fun token thread using your wallets. This can be useful for:

- Increasing engagement on your token's thread
- Participating in community discussions
- Supporting projects you like

### Key Features:

1. **Multiple Comment Types**:
   - AI-generated comments using OpenAI (requires API key)
   - Randomized positive comments from a pre-defined library
   - Custom comments of your choice

2. **Thread or Direct Mode**:
   - Post new comments directly
   - Reply to existing comments on the thread

3. **Proxy Support**:
   - Use HTTP/HTTPS or SOCKS proxies to avoid rate limiting
   - Rotate proxies automatically across your wallets
   - Define proxies in a simple text file

4. **Multiple Wallet Support**:
   - Post with all your wallets
   - Control the number of comments per wallet

### How to Use:

1. **Via CLI Menu**:
   ```
   npm run labs
   ```
   Then select "Post PumpFun Replies" from the menu.

2. **Via Direct Command**:
   ```
   npm run labs:cmd post-replies --token-mint YOUR_TOKEN_MINT --proxies
   ```

3. **Available Options**:
   - `--token-mint <address>`: The token mint address
   - `--comment <text>`: Custom comment text
   - `--ai`: Use AI to generate comments
   - `--randomize`: Use random positive comments
   - `--proxies`: Use proxies for requests (requires proxies.txt)

### Proxy Configuration:

Create a `proxies.txt` file in the root directory with each proxy on a new line:
```
http://username:password@host:port
socks5://username:password@host:port
```

### Advanced Settings:

Configure timing and other settings in your `.env` file:
```
COMMENT_MIN_INTERVAL=1000  # Minimum ms between comments
COMMENT_MAX_INTERVAL=3000  # Maximum ms between comments
OPENAI_KEY=your_openai_key  # For AI-generated comments
```

## License
ISC

# Solana MMarker

A commercial-grade Solana bot for market making, advanced trading, and pump.fun interactions with comprehensive wallet management and transaction execution options.

## Premium Features

- **Multi-Wallet Market Making**
  - Automatic spread management across multiple DEXes
  - Customizable risk parameters and volume generation
  - Intelligent order sizing based on liquidity
  - Support for Raydium, Jupiter, and Pump.fun

- **Advanced Execution Methods**
  - JITO bundled transaction support for MEV protection
  - Lightning mode for priority-based transaction execution
  - Configurable priority fees for high-congestion periods
  - Transaction retry and automatic fee optimization

- **Wallet Management & Infrastructure**
  - Create and manage multiple Solana wallets
  - SOL and token distribution across wallets
  - Wallet monitoring with balance change notifications
  - Dust collection and token consolidation

- **Pump.fun Engagement Suite**
  - Post comments on tokens with multiple wallets
  - AI-generated comments via OpenAI
  - Token monitoring to track activity
  - Like comments to build engagement

- **Security & Protection**
  - Commercial-grade license protection
  - Hardware binding for license keys
  - Feature-based licensing tiers
  - Encrypted configuration management

## Building and Packaging

### Development Setup

```bash
# Install dependencies
npm install

# Build the TypeScript code
npm run build

# Run in development mode
npm run dev
```

### Packaging for Distribution

To create binary distributions for different operating systems:

```bash
# Package for all platforms
npm run package

# Package with code obfuscation (recommended for commercial distribution)
npm run package-obfuscated
```

This will create executable binaries in the `releases` directory for macOS, Windows, and Linux.

## Market Making Configuration

The market maker can be configured with various parameters:

```bash
# Start market making with default parameters
solana-mmaker marketmaker --token-mint TOKEN_MINT --wallets-path ./wallets.json

# Advanced configuration
solana-mmaker marketmaker --token-mint TOKEN_MINT --spread 2 --volume 1000 --jito --lightning
```

### Key Parameters:

- `--spread`: The bid-ask spread percentage (default: 1%)
- `--volume`: Daily target volume in USD (default: $10,000)
- `--wallet-count`: Number of wallets to use (default: all available)
- `--jito`: Use JITO execution for MEV protection
- `--lightning`: Use Lightning mode for faster execution
- `--priority-fee`: Custom priority fee (in SOL)

## Wallet Management

Comprehensive wallet management functionality:

```bash
# Create new wallets
solana-mmaker wallets create --count 5

# Distribute SOL to wallets
solana-mmaker wallets distribute --amount 0.1

# Collect dust from wallets
solana-mmaker wallets collect --min-amount 0.001

# Transfer tokens between wallets
solana-mmaker wallets transfer --from WALLET_ADDR --to WALLET_ADDR --amount 1.5 --token-mint TOKEN_MINT
```

## License Management

This software uses a license management system to protect your intellectual property:

1. License keys are bound to specific machines using hardware identifiers
2. Licenses have configurable expiration dates and feature sets
3. Support for online verification and offline fallback
4. Different license tiers with varying feature sets

### License Tiers

The system supports different license tiers:

- **Trial**: Limited features and wallets, expires after 30 days
- **Standard**: Basic features, limited wallets
- **Premium**: All features, increased wallet limits
- **Enterprise**: Unlimited features and wallets, dedicated support

## Distribution Notes

When distributing your commercial bot:

1. Change all URLs and server references to your own domains
2. Update all licensing URLs and instructions
3. Configure proper expiration dates for different license tiers
4. Consider adding hardware lockdown for enterprise customers

## Security Considerations

The packaging system implements multiple layers of protection:

1. Binary compilation makes the code unreadable
2. Code obfuscation transforms function names and logic
3. Machine-binding prevents simple license sharing
4. Encryption of configuration and license files

## Support

For support or to purchase a license, contact:

- Website: [https://yourcompany.com/solana-mmaker](https://yourcompany.com/solana-mmaker)
- Email: support@yourcompany.com

## Legal

This software is for commercial use only under the terms of your license agreement. Unauthorized reproduction or distribution is prohibited.
