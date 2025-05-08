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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAITradingStrategy = exports.AITradingStrategy = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const openai_1 = __importDefault(require("openai"));
const axios_1 = __importDefault(require("axios"));
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
/**
 * AI-enhanced trading strategy manager
 * Uses real-time data and AI to optimize trading parameters
 */
class AITradingStrategy {
    constructor(tokenAddress, connection, initialParameters, useAi = false, apiKey) {
        this.metrics = null;
        this.lastUpdated = 0;
        this.openai = null;
        this.updateInterval = 5 * 60 * 1000; // 5 minutes
        this.metricsHistory = [];
        this.historyMaxLength = 12; // Keep last 12 data points
        this.tokenAddress = tokenAddress;
        this.connection = connection;
        this.defaultParameters = { ...initialParameters };
        this.currentParameters = { ...initialParameters };
        this.useAi = useAi;
        // Initialize OpenAI if API key is provided
        if (useAi) {
            const openaiKey = apiKey || process.env.OPENAI_API_KEY;
            if (openaiKey) {
                this.openai = new openai_1.default({ apiKey: openaiKey });
                console.log(chalk_1.default.green('AI trading strategy optimization enabled'));
            }
            else {
                console.log(chalk_1.default.yellow('AI optimization requested but no OpenAI API key provided'));
                this.useAi = false;
            }
        }
    }
    /**
     * Get the current optimized trading parameters
     */
    getParameters() {
        return { ...this.currentParameters };
    }
    /**
     * Update token metrics and optimize parameters if needed
     */
    async update() {
        const now = Date.now();
        // Only update if enough time has passed since the last update
        if (now - this.lastUpdated > this.updateInterval) {
            try {
                // Fetch latest metrics
                const metrics = await this.fetchTokenMetrics();
                this.metrics = metrics;
                this.lastUpdated = now;
                // Add to history
                this.metricsHistory.push(metrics);
                if (this.metricsHistory.length > this.historyMaxLength) {
                    this.metricsHistory.shift(); // Remove oldest entry
                }
                // Optimize parameters if AI is enabled
                if (this.useAi && this.openai) {
                    const recommendation = await this.getAIRecommendation();
                    if (recommendation) {
                        console.log(chalk_1.default.cyan('=== AI Trading Parameter Update ==='));
                        console.log(chalk_1.default.blue(`Market Condition: ${recommendation.marketCondition}`));
                        console.log(chalk_1.default.blue(`AI Confidence: ${recommendation.confidence.toFixed(2)}%`));
                        console.log(chalk_1.default.blue(`Reasoning: ${recommendation.reasoning}`));
                        // Only apply changes if confidence is high enough
                        if (recommendation.confidence >= 70) {
                            this.currentParameters = recommendation.parameters;
                            console.log(chalk_1.default.green('New parameters applied:'));
                            console.log(chalk_1.default.green(`Max Amount: ${this.currentParameters.maxAmount} SOL`));
                            console.log(chalk_1.default.green(`Min Amount: ${this.currentParameters.minAmount} SOL`));
                            console.log(chalk_1.default.green(`Time Between: ${this.currentParameters.timeBetween}ms`));
                            console.log(chalk_1.default.green(`Number of Buys: ${this.currentParameters.numBuys}`));
                            // Save optimization data to file for analysis
                            this.saveOptimizationData(recommendation);
                        }
                        else {
                            console.log(chalk_1.default.yellow(`AI confidence too low (${recommendation.confidence.toFixed(2)}%). Using existing parameters.`));
                        }
                        console.log(chalk_1.default.cyan('==================================='));
                    }
                }
            }
            catch (error) {
                console.error(chalk_1.default.red(`Error updating trading strategy: ${error.message}`));
            }
        }
        return this.getParameters();
    }
    /**
     * Fetch latest token metrics from multiple sources
     */
    async fetchTokenMetrics() {
        const spinner = (0, ora_1.default)('Fetching token metrics for AI optimization...').start();
        const metrics = {
            price: 0,
            volume24h: 0,
            liquidity: 0
        };
        try {
            // Try DexScreener API first
            const dexScreenerUrl = `https://api.dexscreener.com/latest/dex/tokens/${this.tokenAddress}`;
            const response = await axios_1.default.get(dexScreenerUrl, { timeout: 10000 });
            if (response.data && response.data.pairs && response.data.pairs.length > 0) {
                const pair = response.data.pairs[0];
                metrics.price = parseFloat(pair.priceUsd);
                metrics.liquidity = parseFloat(pair.liquidity.usd);
                metrics.volume24h = parseFloat(pair.volume.h24);
                metrics.priceChange1h = parseFloat(pair.priceChange.h1);
                metrics.priceChange24h = parseFloat(pair.priceChange.h24);
                metrics.tradeCount = pair.txns ? (pair.txns.h24Buy + pair.txns.h24Sell) : undefined;
                // Calculate simple volatility based on price changes
                if (metrics.priceChange1h !== undefined && metrics.priceChange24h !== undefined) {
                    metrics.volatility = Math.abs(metrics.priceChange1h) + Math.abs(metrics.priceChange24h / 24);
                }
                spinner.succeed(`Token metrics fetched successfully for ${this.tokenAddress}`);
            }
            else {
                spinner.warn('No trading pairs found for this token on DexScreener');
            }
            // If we have price and liquidity, we can calculate a rough market cap
            if (metrics.price && metrics.liquidity) {
                // This is a very rough estimate based on typical liquidity to market cap ratios
                metrics.marketCap = metrics.liquidity * 10; // Assuming liquidity is ~10% of market cap
            }
        }
        catch (error) {
            spinner.fail(`Error fetching token metrics: ${error.message}`);
            // Use the most recent metrics if available
            if (this.metrics) {
                console.log(chalk_1.default.yellow('Using previous token metrics for optimization'));
                return this.metrics;
            }
        }
        return metrics;
    }
    /**
     * Get AI recommendation for trading parameters
     */
    async getAIRecommendation() {
        if (!this.openai || !this.metrics) {
            return null;
        }
        try {
            // Prepare context for AI
            const currentMetrics = this.metrics;
            const tokenAddress = this.tokenAddress;
            const defaultParams = this.defaultParameters;
            // Market trend analysis
            let marketCondition = 'neutral';
            if (currentMetrics.priceChange24h !== undefined) {
                if (currentMetrics.priceChange24h > 5)
                    marketCondition = 'bullish';
                else if (currentMetrics.priceChange24h < -5)
                    marketCondition = 'bearish';
            }
            // Format the prompt for AI
            const promptContent = `You are an expert crypto trading bot optimizer. I need optimal parameters for a Solana token trading bot based on the latest metrics.

Token Address: ${tokenAddress}
Current Market Condition: ${marketCondition}

Current Metrics:
- Price: $${currentMetrics.price || 'Unknown'}
- 1h Price Change: ${currentMetrics.priceChange1h !== undefined ? currentMetrics.priceChange1h + '%' : 'Unknown'}
- 24h Price Change: ${currentMetrics.priceChange24h !== undefined ? currentMetrics.priceChange24h + '%' : 'Unknown'}
- 24h Volume: $${currentMetrics.volume24h || 'Unknown'}
- Liquidity: $${currentMetrics.liquidity || 'Unknown'}
- Volatility: ${currentMetrics.volatility !== undefined ? currentMetrics.volatility.toFixed(2) : 'Unknown'}
- Estimated Market Cap: $${currentMetrics.marketCap || 'Unknown'}

Current Parameters:
- Max Trade Amount: ${defaultParams.maxAmount} SOL
- Min Trade Amount: ${defaultParams.minAmount} SOL
- Time Between Buys: ${defaultParams.timeBetween}ms
- Number of Buys: ${defaultParams.numBuys}

Based on the current market metrics, suggest optimized parameters that will maximize profits and minimize risks.
For each parameter, provide a specific value (not a range) along with a brief explanation of why this value is optimal.
Include a confidence score (0-100) for your recommendation and identify the current market condition.

Format your response as a JSON object with these fields:
{
  "parameters": {
    "maxAmount": number,
    "minAmount": number, 
    "timeBetween": number,
    "numBuys": number,
    "buyBatchSize": number,
    "sellThreshold": number,
    "stopLoss": number,
    "takeProfit": number
  },
  "reasoning": "brief explanation",
  "confidence": number,
  "marketCondition": "bullish|bearish|neutral|volatile|rangebound"
}`;
            // Get AI recommendation
            const response = await this.openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: "You are an expert crypto trading bot optimizer that provides precise parameter recommendations based on token data." },
                    { role: "user", content: promptContent }
                ],
                temperature: 0.2,
                response_format: { type: "json_object" }
            });
            const content = response.choices[0].message.content;
            if (!content) {
                console.log(chalk_1.default.yellow('Empty response from AI recommendation system'));
                return null;
            }
            try {
                const recommendation = JSON.parse(content);
                return recommendation;
            }
            catch (parseError) {
                console.error(chalk_1.default.red(`Failed to parse AI recommendation: ${parseError}`));
                return null;
            }
        }
        catch (error) {
            console.error(chalk_1.default.red(`Error getting AI recommendation: ${error.message}`));
            return null;
        }
    }
    /**
     * Save optimization data to file for analysis
     */
    saveOptimizationData(recommendation) {
        try {
            const projectRootDir = path.resolve(__dirname, '../../');
            const optimizationDir = path.join(projectRootDir, '.config', 'optimizations');
            // Create directory if it doesn't exist
            if (!fs.existsSync(optimizationDir)) {
                fs.mkdirSync(optimizationDir, { recursive: true });
            }
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `${this.tokenAddress.slice(0, 8)}_${timestamp}.json`;
            const filePath = path.join(optimizationDir, filename);
            // Prepare data for saving
            const optimizationData = {
                timestamp: new Date().toISOString(),
                tokenAddress: this.tokenAddress,
                metrics: this.metrics,
                recommendation: recommendation,
                previousParameters: this.defaultParameters,
                newParameters: this.currentParameters
            };
            // Save to file
            fs.writeFileSync(filePath, JSON.stringify(optimizationData, null, 2));
            console.log(chalk_1.default.green(`Optimization data saved to ${filePath}`));
        }
        catch (error) {
            console.error(chalk_1.default.red(`Error saving optimization data: ${error.message}`));
        }
    }
    /**
     * Reset parameters to defaults
     */
    resetToDefaults() {
        this.currentParameters = { ...this.defaultParameters };
        console.log(chalk_1.default.yellow('Trading parameters reset to defaults'));
    }
}
exports.AITradingStrategy = AITradingStrategy;
/**
 * Factory function to create an AI trading strategy
 */
async function createAITradingStrategy(tokenAddress, connection, initialMaxAmount, initialMinAmount, initialTimeBetween, initialNumBuys, useAi = false) {
    // Convert string parameters to numbers
    const maxAmount = typeof initialMaxAmount === 'string' ? parseFloat(initialMaxAmount) : initialMaxAmount;
    const minAmount = typeof initialMinAmount === 'string' ? parseFloat(initialMinAmount) : initialMinAmount;
    const timeBetween = typeof initialTimeBetween === 'string' ? parseInt(initialTimeBetween) : initialTimeBetween;
    const numBuys = typeof initialNumBuys === 'string' ? parseInt(initialNumBuys) : initialNumBuys;
    // Create initial parameters
    const initialParameters = {
        maxAmount,
        minAmount,
        timeBetween,
        numBuys,
        // Default values for advanced parameters
        buyBatchSize: 1,
        sellThreshold: 0.05, // 5% profit target
        stopLoss: 0.1, // 10% stop loss
        takeProfit: 0.2 // 20% take profit
    };
    // Create and return the strategy
    return new AITradingStrategy(tokenAddress, connection, initialParameters, useAi);
}
exports.createAITradingStrategy = createAITradingStrategy;
