import { Connection } from '@solana/web3.js';
interface TradingParameters {
    maxAmount: number;
    minAmount: number;
    timeBetween: number;
    numBuys: number;
    buyBatchSize?: number;
    sellThreshold?: number;
    stopLoss?: number;
    takeProfit?: number;
}
/**
 * AI-enhanced trading strategy manager
 * Uses real-time data and AI to optimize trading parameters
 */
export declare class AITradingStrategy {
    private tokenAddress;
    private connection;
    private metrics;
    private lastUpdated;
    private currentParameters;
    private defaultParameters;
    private useAi;
    private openai;
    private updateInterval;
    private metricsHistory;
    private historyMaxLength;
    private solPrice;
    constructor(tokenAddress: string, connection: Connection, initialParameters: TradingParameters, useAi?: boolean, apiKey?: string);
    /**
     * Get the current optimized trading parameters
     */
    getParameters(): TradingParameters;
    /**
     * Update token metrics and optimize parameters if needed
     */
    update(): Promise<TradingParameters>;
    /**
     * Fetch latest token metrics from multiple sources
     */
    private fetchTokenMetrics;
    /**
     * Fetch the current SOL price in USD
     */
    private fetchSolPrice;
    /**
     * Attempt to fetch metrics from alternative sources when primary source fails
     */
    private fetchFallbackMetrics;
    /**
     * Get AI recommendation for trading parameters
     */
    private getAIRecommendation;
    /**
     * Save optimization data to file for analysis
     */
    private saveOptimizationData;
    /**
     * Reset parameters to defaults
     */
    resetToDefaults(): void;
}
/**
 * Factory function to create an AI trading strategy
 */
export declare function createAITradingStrategy(tokenAddress: string, connection: Connection, initialMaxAmount: number | string, initialMinAmount: number | string, initialTimeBetween: number | string, initialNumBuys: number | string, useAi?: boolean): Promise<AITradingStrategy>;
export {};
