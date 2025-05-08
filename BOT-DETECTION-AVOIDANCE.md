# Advanced Bot Detection Avoidance

This guide explains how to use the enhanced bot detection avoidance features in your trading bot to make your trading activity appear more organic and human-like.

## Key Features

### 1. Randomized Trade Sizes

The bot now supports variable trade sizes within a configurable range to avoid the pattern of identical trade amounts that scream "bot".

- Default range: 0.8 to 2.3 SOL per trade
- Both buy and sell orders are randomized
- Decimal places are also randomized (0-4 decimal places)

**Configuration:**
```
MIN_TRADE_AMOUNT=0.8
MAX_TRADE_AMOUNT=2.3
```

### 2. Variable Trade Timing

Fixed timing intervals are easy to detect. The bot now implements variable delays between trades:

- Default range: 40 to 120 seconds between trades
- Uses non-uniform distribution for more natural patterns
- Adds random variation to avoid detectable rhythms

**Configuration:**
```
MIN_DELAY_SECONDS=40
MAX_DELAY_SECONDS=120
```

### 3. Multi-Wallet Distribution

Using multiple wallets makes your trading look more organic:

- Automatically limits to 3-5 wallets for trading activity
- Supports different wallet rotation strategies:
  - `random` - Completely random selection (default)
  - `sequential` - Rotates through wallets in sequence
  - `weighted` - Selects wallets based on their balance

**Configuration:**
```
WALLET_ROTATION_STRATEGY=random
```

### 4. Adaptive Trading

The bot can now automatically adjust to market conditions:

- Slows down during low volume periods
- Increases trade frequency slightly when token is trending
- Adjusts trade sizes based on market cap/liquidity
- Maintains price stability through balanced buy/sell patterns

**Configuration:**
```
ADAPTIVE_TRADING=true
```

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

Add these to your `.env` file:

```
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
```

## Implementation Details

These features are provided by the following components:

1. `src/utils/botDetectionAvoidance.ts` - Core utility functions
2. Enhanced `TradingBot` class in `src/bot.ts`

## Best Practices

For optimal bot detection avoidance:

1. **Don't run 24/7** - Schedule trading during active market hours
2. **Adjust for token size** - Use smaller trades for smaller tokens
3. **Vary trade patterns** - Occasionally change your min/max settings
4. **Monitor market flow** - Adjust frequency when volume changes
5. **Mirror real trades** - Consider enabling the adaptive trading feature

By implementing these best practices, your trading activity will blend in with natural trading patterns, significantly reducing the likelihood of detection. 