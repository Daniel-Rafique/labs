"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateConsistentSessionId = exports.generateBalancedOrderPattern = exports.adaptToMarketConditions = exports.selectWalletForTrade = exports.getRandomizedTradeDelay = exports.getRandomizedTradeSize = void 0;
const crypto = __importStar(require("crypto"));
/**
 * Randomizes trade size within a given range
 * @param minAmount Minimum trade amount in SOL
 * @param maxAmount Maximum trade amount in SOL
 * @returns Random trade amount between min and max
 */
function getRandomizedTradeSize(minAmount, maxAmount) {
    // Generate a random trade amount between min and max
    const randomFactor = Math.random(); // 0 to 1
    const tradeAmount = minAmount + randomFactor * (maxAmount - minAmount);
    // Add some randomization in decimals (0-4 decimal places)
    const decimalPlaces = Math.floor(Math.random() * 5);
    // Round to the random number of decimal places
    return parseFloat(tradeAmount.toFixed(decimalPlaces));
}
exports.getRandomizedTradeSize = getRandomizedTradeSize;
/**
 * Generates a random delay between trades
 * @param minDelay Minimum delay in seconds
 * @param maxDelay Maximum delay in seconds
 * @returns Random delay in milliseconds
 */
function getRandomizedTradeDelay(minDelay = 40, maxDelay = 120) {
    // Convert seconds to milliseconds
    const minDelayMs = minDelay * 1000;
    const maxDelayMs = maxDelay * 1000;
    // Generate random delay with non-uniform distribution for more natural pattern
    // Use triangular distribution to make delays cluster more toward the center
    let rand = Math.random() + Math.random();
    if (rand > 1)
        rand = 2 - rand;
    const delay = minDelayMs + rand * (maxDelayMs - minDelayMs);
    return Math.floor(delay);
}
exports.getRandomizedTradeDelay = getRandomizedTradeDelay;
/**
 * Choose a wallet from the available wallets based on various strategies
 * @param wallets Array of wallet keypairs
 * @param strategy Optional strategy for wallet selection: 'random', 'sequential', 'weighted'
 * @returns Selected wallet index
 */
function selectWalletForTrade(wallets, strategy = 'random', currentIndex = 0) {
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
                    if (random <= 0)
                        return i;
                }
                return 0; // Fallback
            }
            catch (error) {
                // Fallback to random if there's an error
                return Math.floor(Math.random() * effectiveWallets.length);
            }
        case 'random':
        default:
            // Completely random selection
            return Math.floor(Math.random() * effectiveWallets.length);
    }
}
exports.selectWalletForTrade = selectWalletForTrade;
/**
 * Adjust trading parameters based on current market conditions
 * @param baseParams Base parameters that will be adjusted
 * @param marketMetrics Current market metrics
 * @returns Adjusted parameters
 */
function adaptToMarketConditions(baseParams, marketMetrics) {
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
exports.adaptToMarketConditions = adaptToMarketConditions;
/**
 * Creates a pattern of alternating buy and sell orders
 * with slightly randomized quantities to maintain price stability
 * @param totalOrders Number of orders to generate
 * @param buyBias Bias towards buy orders (0.5 = equal, >0.5 = more buys)
 * @returns Array of order types ('buy' or 'sell')
 */
function generateBalancedOrderPattern(totalOrders, buyBias = 0.5) {
    const orders = [];
    let lastOrderType = null;
    for (let i = 0; i < totalOrders; i++) {
        // Decide if this should be a buy or sell
        let orderType;
        if (lastOrderType === null) {
            // First order - use bias
            orderType = Math.random() < buyBias ? 'buy' : 'sell';
        }
        else {
            // Subsequent orders - tend to alternate with some randomness
            const shouldAlternate = Math.random() < 0.7; // 70% chance to alternate
            if (shouldAlternate) {
                // Alternate from previous order
                orderType = lastOrderType === 'buy' ? 'sell' : 'buy';
            }
            else {
                // Same as previous with bias applied
                orderType = Math.random() < buyBias ? 'buy' : 'sell';
            }
        }
        orders.push(orderType);
        lastOrderType = orderType;
    }
    return orders;
}
exports.generateBalancedOrderPattern = generateBalancedOrderPattern;
/**
 * Generate a unique session ID for consistent proxy usage per wallet
 * @param seed A seed string (like wallet address) to make the session consistent
 * @returns A unique session ID
 */
function generateConsistentSessionId(seed) {
    const hash = crypto.createHash('md5').update(seed).digest('hex');
    return `s-${hash.substring(0, 8)}`;
}
exports.generateConsistentSessionId = generateConsistentSessionId;
