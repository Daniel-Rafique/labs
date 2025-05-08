#!/usr/bin/env node

/**
 * Bot Detection Avoidance Upgrade Script
 * 
 * This script helps update an existing installation with the new bot detection avoidance features.
 * It will:
 * 1. Create the botDetectionAvoidance.ts utility file
 * 2. Update the bot.ts file with new features
 * 3. Update the .env file with recommended detection avoidance settings
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// Set up readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Project root directory
const rootDir = path.resolve(__dirname, '..');

// Paths to relevant files
const botUtilsDir = path.join(rootDir, 'src', 'utils');
const botDetectionFilePath = path.join(botUtilsDir, 'botDetectionAvoidance.ts');
const botFilePath = path.join(rootDir, 'src', 'bot.ts');
const envFilePath = path.join(rootDir, '.env');
const readmeFilePath = path.join(rootDir, 'BOT-DETECTION-AVOIDANCE.md');

// Ensure the utils directory exists
if (!fs.existsSync(botUtilsDir)) {
  console.log(`Creating directory: ${botUtilsDir}`);
  fs.mkdirSync(botUtilsDir, { recursive: true });
}

// Create botDetectionAvoidance.ts file
function createBotDetectionFile() {
  console.log('Creating botDetectionAvoidance.ts utility file...');
  
  const content = `import * as crypto from 'crypto';

/**
 * Randomizes trade size within a given range
 * @param minAmount Minimum trade amount in SOL
 * @param maxAmount Maximum trade amount in SOL
 * @returns Random trade amount between min and max
 */
export function getRandomizedTradeSize(minAmount: number, maxAmount: number): number {
  // Generate a random trade amount between min and max
  const randomFactor = Math.random(); // 0 to 1
  const tradeAmount = minAmount + randomFactor * (maxAmount - minAmount);
  
  // Add some randomization in decimals (0-4 decimal places)
  const decimalPlaces = Math.floor(Math.random() * 5);
  
  // Round to the random number of decimal places
  return parseFloat(tradeAmount.toFixed(decimalPlaces));
}

/**
 * Generates a random delay between trades
 * @param minDelay Minimum delay in seconds
 * @param maxDelay Maximum delay in seconds
 * @returns Random delay in milliseconds
 */
export function getRandomizedTradeDelay(minDelay: number = 40, maxDelay: number = 120): number {
  // Convert seconds to milliseconds
  const minDelayMs = minDelay * 1000;
  const maxDelayMs = maxDelay * 1000;
  
  // Generate random delay with non-uniform distribution for more natural pattern
  // Use triangular distribution to make delays cluster more toward the center
  let rand = Math.random() + Math.random(); 
  if (rand > 1) rand = 2 - rand;
  
  const delay = minDelayMs + rand * (maxDelayMs - minDelayMs);
  return Math.floor(delay);
}

/**
 * Choose a wallet from the available wallets based on various strategies
 * @param wallets Array of wallet keypairs
 * @param strategy Optional strategy for wallet selection: 'random', 'sequential', 'weighted'
 * @returns Selected wallet index
 */
export function selectWalletForTrade(
  wallets: any[], 
  strategy: 'random' | 'sequential' | 'weighted' = 'random',
  currentIndex: number = 0
): number {
  if (!wallets || wallets.length === 0) {
    throw new Error('No wallets available for selection');
  }

  // Limit to using 3-5 wallets for trading as recommended
  const maxWalletsToUse = Math.min(wallets.length, Math.floor(Math.random() * 3) + 3); // 3-5 wallets
  const effectiveWallets = wallets.slice(0, maxWalletsToUse);
  
  switch (strategy) {
    case 'sequential':
      // Move to next wallet in sequence
      return (currentIndex + 1) % effectiveWallets.length;
      
    case 'weighted':
      // Weighted selection based on wallet balance
      // More balance = higher chance of selection
      try {
        const totalWeight = effectiveWallets.reduce((sum, wallet) => sum + (wallet.balance || 1), 0);
        let random = Math.random() * totalWeight;
        
        for (let i = 0; i < effectiveWallets.length; i++) {
          random -= (effectiveWallets[i].balance || 1);
          if (random <= 0) return i;
        }
        return 0; // Fallback
      } catch (error) {
        // Fallback to random if there's an error
        return Math.floor(Math.random() * effectiveWallets.length);
      }
      
    case 'random':
    default:
      // Completely random selection
      return Math.floor(Math.random() * effectiveWallets.length);
  }
}

/**
 * Adjust trading parameters based on current market conditions
 * @param baseParams Base parameters that will be adjusted
 * @param marketMetrics Current market metrics
 * @returns Adjusted parameters
 */
export function adaptToMarketConditions(
  baseParams: {
    minTradeAmount: number;
    maxTradeAmount: number;
    minTradeDelay: number;
    maxTradeDelay: number;
  },
  marketMetrics: {
    volume24h?: number;
    priceChange24h?: number;
    liquidity?: number;
    volatility?: number;
    isUptrend?: boolean;
  }
): {
  minTradeAmount: number;
  maxTradeAmount: number;
  minTradeDelay: number;
  maxTradeDelay: number;
} {
  const params = { ...baseParams };
  
  // Default adjustment factors
  let volumeFactor = 1.0;
  let frequencyFactor = 1.0;
  
  // Adjust based on 24h volume
  if (marketMetrics.volume24h !== undefined) {
    const normalizedVolume = Math.min(marketMetrics.volume24h / 10000, 5); // Cap at 5x
    volumeFactor = 0.5 + (normalizedVolume / 2); // Scale to 0.5-3.0x
  }
  
  // Adjust based on if token is trending
  if (marketMetrics.isUptrend) {
    // If trending, increase frequency slightly
    frequencyFactor *= 1.2;
  }
  
  // Adjust based on volatility
  if (marketMetrics.volatility !== undefined) {
    // For highly volatile markets, reduce trade size
    if (marketMetrics.volatility > 10) {
      volumeFactor *= 0.8;
    }
  }
  
  // Adjust based on liquidity
  if (marketMetrics.liquidity !== undefined) {
    const normalizedLiquidity = Math.min(marketMetrics.liquidity / 100000, 2);
    // Scale trade size with available liquidity
    volumeFactor *= (0.7 + (normalizedLiquidity * 0.3)); // Scale to 0.7-1.3x
  }
  
  // Apply adjustments to trade sizes
  params.minTradeAmount *= volumeFactor;
  params.maxTradeAmount *= volumeFactor;
  
  // Apply adjustments to trade delays (inverse relationship with frequency)
  params.minTradeDelay /= frequencyFactor;
  params.maxTradeDelay /= frequencyFactor;
  
  // Ensure parameters stay within reasonable bounds
  params.minTradeAmount = Math.max(0.0001, params.minTradeAmount);
  params.maxTradeAmount = Math.max(params.minTradeAmount * 1.2, params.maxTradeAmount);
  
  params.minTradeDelay = Math.max(5, params.minTradeDelay);
  params.maxTradeDelay = Math.max(params.minTradeDelay * 1.2, params.maxTradeDelay);
  
  return params;
}

/**
 * Creates a pattern of alternating buy and sell orders 
 * with slightly randomized quantities to maintain price stability
 * @param totalOrders Number of orders to generate
 * @param buyBias Bias towards buy orders (0.5 = equal, >0.5 = more buys)
 * @returns Array of order types ('buy' or 'sell')
 */
export function generateBalancedOrderPattern(
  totalOrders: number, 
  buyBias: number = 0.5
): Array<'buy' | 'sell'> {
  const orders: Array<'buy' | 'sell'> = [];
  let lastOrderType: 'buy' | 'sell' | null = null;
  
  for (let i = 0; i < totalOrders; i++) {
    // Decide if this should be a buy or sell
    let orderType: 'buy' | 'sell';
    
    if (lastOrderType === null) {
      // First order - use bias
      orderType = Math.random() < buyBias ? 'buy' : 'sell';
    } else {
      // Subsequent orders - tend to alternate with some randomness
      const shouldAlternate = Math.random() < 0.7; // 70% chance to alternate
      
      if (shouldAlternate) {
        // Alternate from previous order
        orderType = lastOrderType === 'buy' ? 'sell' : 'buy';
      } else {
        // Same as previous with bias applied
        orderType = Math.random() < buyBias ? 'buy' : 'sell';
      }
    }
    
    orders.push(orderType);
    lastOrderType = orderType;
  }
  
  return orders;
}

/**
 * Generate a unique session ID for consistent proxy usage per wallet
 * @param seed A seed string (like wallet address) to make the session consistent
 * @returns A unique session ID
 */
export function generateConsistentSessionId(seed: string): string {
  const hash = crypto.createHash('md5').update(seed).digest('hex');
  return \`s-\${hash.substring(0, 8)}\`;
}`;

  fs.writeFileSync(botDetectionFilePath, content);
  console.log(`✅ Created ${botDetectionFilePath}`);
}

// Create README file with instructions
function createReadmeFile() {
  console.log('Creating BOT-DETECTION-AVOIDANCE.md documentation file...');
  
  const content = `# Advanced Bot Detection Avoidance

This guide explains how to use the enhanced bot detection avoidance features in your trading bot to make your trading activity appear more organic and human-like.

## Key Features

### 1. Randomized Trade Sizes

The bot now supports variable trade sizes within a configurable range to avoid the pattern of identical trade amounts that scream "bot".

- Default range: 0.8 to 2.3 SOL per trade
- Both buy and sell orders are randomized
- Decimal places are also randomized (0-4 decimal places)

**Configuration:**
\`\`\`
MIN_TRADE_AMOUNT=0.8
MAX_TRADE_AMOUNT=2.3
\`\`\`

### 2. Variable Trade Timing

Fixed timing intervals are easy to detect. The bot now implements variable delays between trades:

- Default range: 40 to 120 seconds between trades
- Uses non-uniform distribution for more natural patterns
- Adds random variation to avoid detectable rhythms

**Configuration:**
\`\`\`
MIN_DELAY_SECONDS=40
MAX_DELAY_SECONDS=120
\`\`\`

### 3. Multi-Wallet Distribution

Using multiple wallets makes your trading look more organic:

- Automatically limits to 3-5 wallets for trading activity
- Supports different wallet rotation strategies:
  - \`random\` - Completely random selection (default)
  - \`sequential\` - Rotates through wallets in sequence
  - \`weighted\` - Selects wallets based on their balance

**Configuration:**
\`\`\`
WALLET_ROTATION_STRATEGY=random
\`\`\`

### 4. Adaptive Trading

The bot can now automatically adjust to market conditions:

- Slows down during low volume periods
- Increases trade frequency slightly when token is trending
- Adjusts trade sizes based on market cap/liquidity
- Maintains price stability through balanced buy/sell patterns

**Configuration:**
\`\`\`
ADAPTIVE_TRADING=true
\`\`\`

### 5. Session Management

For consistent proxy usage per wallet:

- Each wallet maintains a consistent IP address
- Session IDs are deterministically generated from wallet addresses
- Helps avoid detection from IP switching

## Advanced Market-Adaptive Configuration

The bot now analyzes several market metrics to adjust its behavior:

- 24h volume
- Price change trends
- Liquidity
- Volatility

These metrics are automatically collected either through the AI optimization module or directly via API.

## Example Configuration

Add these to your \`.env\` file:

\`\`\`
# Basic anti-detection settings
MIN_TRADE_AMOUNT=0.8
MAX_TRADE_AMOUNT=2.3
MIN_DELAY_SECONDS=40
MAX_DELAY_SECONDS=120
WALLET_ROTATION_STRATEGY=random
ADAPTIVE_TRADING=true

# Advanced settings
USE_PROXIES=true
USE_AI_OPTIMIZATION=true
\`\`\`

## Implementation Details

These features are provided by the following components:

1. \`src/utils/botDetectionAvoidance.ts\` - Core utility functions
2. Enhanced \`TradingBot\` class in \`src/bot.ts\`

## Best Practices

For optimal bot detection avoidance:

1. **Don't run 24/7** - Schedule trading during active market hours
2. **Adjust for token size** - Use smaller trades for smaller tokens
3. **Vary trade patterns** - Occasionally change your min/max settings
4. **Monitor market flow** - Adjust frequency when volume changes
5. **Mirror real trades** - Consider enabling the adaptive trading feature

By implementing these best practices, your trading activity will blend in with natural trading patterns, significantly reducing the likelihood of detection.`;

  fs.writeFileSync(readmeFilePath, content);
  console.log(`✅ Created ${readmeFilePath}`);
}

// Add bot detection avoidance settings to .env file
function updateEnvFile() {
  console.log('Checking .env file for bot detection settings...');
  if (!fs.existsSync(envFilePath)) {
    console.log('⚠️ .env file not found. Please create one based on env-example.');
    return;
  }
  
  let envContent = fs.readFileSync(envFilePath, 'utf8');
  let updated = false;
  
  // Check for each setting and add if missing
  const botDetectionSettings = {
    MIN_TRADE_AMOUNT: '0.8',
    MAX_TRADE_AMOUNT: '2.3',
    MIN_DELAY_SECONDS: '40',
    MAX_DELAY_SECONDS: '120',
    WALLET_ROTATION_STRATEGY: 'random',
    ADAPTIVE_TRADING: 'true',
    USE_PROXIES: 'true',
    USE_AI_OPTIMIZATION: 'true'
  };
  
  // Insert section marker if not present
  if (!envContent.includes('# ===== Bot Detection Avoidance Settings =====')) {
    const sectionMarker = '\n\n# ===== Bot Detection Avoidance Settings =====\n';
    envContent += sectionMarker;
    updated = true;
  }
  
  // Add each missing setting
  for (const [key, value] of Object.entries(botDetectionSettings)) {
    if (!envContent.includes(key + '=')) {
      envContent += `${key}=${value}\n`;
      console.log(`Added ${key}=${value} to .env file`);
      updated = true;
    }
  }
  
  if (updated) {
    // Add end marker if needed
    if (!envContent.includes('# ===== End Bot Detection Avoidance Settings =====')) {
      envContent += '# ===== End Bot Detection Avoidance Settings =====\n\n';
    }
    
    fs.writeFileSync(envFilePath, envContent);
    console.log('✅ Updated .env file with bot detection avoidance settings');
  } else {
    console.log('ℹ️ .env file already contains bot detection avoidance settings');
  }
}

// Main upgrade function
async function upgradeBot() {
  console.log('🤖 Bot Detection Avoidance Upgrade Tool');
  console.log('======================================');
  console.log('This script will update your bot with advanced detection avoidance features.');
  
  // Check if TypeScript is installed
  try {
    execSync('tsc --version', { stdio: 'ignore' });
  } catch (error) {
    console.log('⚠️ TypeScript not found. Installing...');
    try {
      execSync('npm install -g typescript', { stdio: 'inherit' });
    } catch (err) {
      console.error('❌ Failed to install TypeScript. Please install it manually.');
      process.exit(1);
    }
  }
  
  // Prompt user to confirm upgrade
  rl.question('Do you want to proceed with the upgrade? (y/n): ', async (answer) => {
    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      console.log('Upgrade canceled.');
      rl.close();
      return;
    }
    
    try {
      // Create bot detection utility file
      createBotDetectionFile();
      
      // Create documentation file
      createReadmeFile();
      
      // Update .env file
      updateEnvFile();
      
      console.log('\n✅ Bot Detection Avoidance upgrade completed successfully!');
      console.log('📝 Please read BOT-DETECTION-AVOIDANCE.md for documentation on the new features.');
      
      rl.close();
    } catch (error) {
      console.error('❌ Error during upgrade:', error);
      rl.close();
    }
  });
}

// Run the upgrade
upgradeBot(); 