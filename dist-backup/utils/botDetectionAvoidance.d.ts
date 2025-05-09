/**
 * Randomizes trade size within a given range
 * @param minAmount Minimum trade amount in SOL
 * @param maxAmount Maximum trade amount in SOL
 * @returns Random trade amount between min and max
 */
export declare function getRandomizedTradeSize(minAmount: number, maxAmount: number): number;
/**
 * Generates a random delay between trades
 * @param minDelay Minimum delay in seconds
 * @param maxDelay Maximum delay in seconds
 * @returns Random delay in milliseconds
 */
export declare function getRandomizedTradeDelay(minDelay?: number, maxDelay?: number): number;
/**
 * Choose a wallet from the available wallets based on various strategies
 * @param wallets Array of wallet keypairs
 * @param strategy Optional strategy for wallet selection: 'random', 'sequential', 'weighted'
 * @returns Selected wallet index
 */
export declare function selectWalletForTrade(wallets: any[], strategy?: 'random' | 'sequential' | 'weighted', currentIndex?: number): number;
/**
 * Adjust trading parameters based on current market conditions
 * @param baseParams Base parameters that will be adjusted
 * @param marketMetrics Current market metrics
 * @returns Adjusted parameters
 */
export declare function adaptToMarketConditions(baseParams: {
    minTradeAmount: number;
    maxTradeAmount: number;
    minTradeDelay: number;
    maxTradeDelay: number;
}, marketMetrics: {
    volume24h?: number;
    priceChange24h?: number;
    liquidity?: number;
    volatility?: number;
    isUptrend?: boolean;
}): {
    minTradeAmount: number;
    maxTradeAmount: number;
    minTradeDelay: number;
    maxTradeDelay: number;
};
/**
 * Creates a pattern of alternating buy and sell orders
 * with slightly randomized quantities to maintain price stability
 * @param totalOrders Number of orders to generate
 * @param buyBias Bias towards buy orders (0.5 = equal, >0.5 = more buys)
 * @returns Array of order types ('buy' or 'sell')
 */
export declare function generateBalancedOrderPattern(totalOrders: number, buyBias?: number): Array<'buy' | 'sell'>;
/**
 * Generate a unique session ID for consistent proxy usage per wallet
 * @param seed A seed string (like wallet address) to make the session consistent
 * @returns A unique session ID
 */
export declare function generateConsistentSessionId(seed: string): string;
