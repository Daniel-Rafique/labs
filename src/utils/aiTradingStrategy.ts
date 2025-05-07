import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import axios from 'axios';
import { PublicKey, Connection } from '@solana/web3.js';
import chalk from 'chalk';
import ora from 'ora';

interface TokenMetrics {
  price: number;
  priceChange1h?: number;
  priceChange24h?: number;
  volume24h?: number;
  liquidity?: number;
  tradeCount?: number;
  volatility?: number;
  holders?: number;
  marketCap?: number;
  tradeHistory?: {
    timestamp: number;
    price: number;
    volume: number;
  }[];
}

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

interface AIRecommendation {
  parameters: TradingParameters;
  reasoning: string;
  confidence: number;
  marketCondition: string;
}

/**
 * AI-enhanced trading strategy manager
 * Uses real-time data and AI to optimize trading parameters
 */
export class AITradingStrategy {
  private tokenAddress: string;
  private connection: Connection;
  private metrics: TokenMetrics | null = null;
  private lastUpdated: number = 0;
  private currentParameters: TradingParameters;
  private defaultParameters: TradingParameters;
  private useAi: boolean;
  private openai: OpenAI | null = null;
  private updateInterval: number = 5 * 60 * 1000; // 5 minutes
  private metricsHistory: TokenMetrics[] = [];
  private historyMaxLength: number = 12; // Keep last 12 data points
  
  constructor(
    tokenAddress: string,
    connection: Connection,
    initialParameters: TradingParameters,
    useAi: boolean = false,
    apiKey?: string
  ) {
    this.tokenAddress = tokenAddress;
    this.connection = connection;
    this.defaultParameters = { ...initialParameters };
    this.currentParameters = { ...initialParameters };
    this.useAi = useAi;
    
    // Initialize OpenAI if API key is provided
    if (useAi) {
      const openaiKey = apiKey || process.env.OPENAI_API_KEY;
      if (openaiKey) {
        this.openai = new OpenAI({ apiKey: openaiKey });
        console.log(chalk.green('AI trading strategy optimization enabled'));
      } else {
        console.log(chalk.yellow('AI optimization requested but no OpenAI API key provided'));
        this.useAi = false;
      }
    }
  }
  
  /**
   * Get the current optimized trading parameters
   */
  public getParameters(): TradingParameters {
    return { ...this.currentParameters };
  }
  
  /**
   * Update token metrics and optimize parameters if needed
   */
  public async update(): Promise<TradingParameters> {
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
            console.log(chalk.cyan('=== AI Trading Parameter Update ==='));
            console.log(chalk.blue(`Market Condition: ${recommendation.marketCondition}`));
            console.log(chalk.blue(`AI Confidence: ${recommendation.confidence.toFixed(2)}%`));
            console.log(chalk.blue(`Reasoning: ${recommendation.reasoning}`));
            
            // Only apply changes if confidence is high enough
            if (recommendation.confidence >= 70) {
              this.currentParameters = recommendation.parameters;
              console.log(chalk.green('New parameters applied:'));
              console.log(chalk.green(`Max Amount: ${this.currentParameters.maxAmount} SOL`));
              console.log(chalk.green(`Min Amount: ${this.currentParameters.minAmount} SOL`));
              console.log(chalk.green(`Time Between: ${this.currentParameters.timeBetween}ms`));
              console.log(chalk.green(`Number of Buys: ${this.currentParameters.numBuys}`));
              
              // Save optimization data to file for analysis
              this.saveOptimizationData(recommendation);
            } else {
              console.log(chalk.yellow(`AI confidence too low (${recommendation.confidence.toFixed(2)}%). Using existing parameters.`));
            }
            
            console.log(chalk.cyan('==================================='));
          }
        }
      } catch (error: any) {
        console.error(chalk.red(`Error updating trading strategy: ${error.message}`));
      }
    }
    
    return this.getParameters();
  }
  
  /**
   * Fetch latest token metrics from multiple sources
   */
  private async fetchTokenMetrics(): Promise<TokenMetrics> {
    const spinner = ora('Fetching token metrics for AI optimization...').start();
    const metrics: TokenMetrics = {
      price: 0,
      volume24h: 0,
      liquidity: 0
    };
    
    try {
      // Try DexScreener API first
      const dexScreenerUrl = `https://api.dexscreener.com/latest/dex/tokens/${this.tokenAddress}`;
      const response = await axios.get(dexScreenerUrl, { timeout: 10000 });
      
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
      } else {
        spinner.warn('No trading pairs found for this token on DexScreener');
      }
      
      // If we have price and liquidity, we can calculate a rough market cap
      if (metrics.price && metrics.liquidity) {
        // This is a very rough estimate based on typical liquidity to market cap ratios
        metrics.marketCap = metrics.liquidity * 10; // Assuming liquidity is ~10% of market cap
      }
    } catch (error: any) {
      spinner.fail(`Error fetching token metrics: ${error.message}`);
      
      // Use the most recent metrics if available
      if (this.metrics) {
        console.log(chalk.yellow('Using previous token metrics for optimization'));
        return this.metrics;
      }
    }
    
    return metrics;
  }
  
  /**
   * Get AI recommendation for trading parameters
   */
  private async getAIRecommendation(): Promise<AIRecommendation | null> {
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
        if (currentMetrics.priceChange24h > 5) marketCondition = 'bullish';
        else if (currentMetrics.priceChange24h < -5) marketCondition = 'bearish';
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
        console.log(chalk.yellow('Empty response from AI recommendation system'));
        return null;
      }
      
      try {
        const recommendation = JSON.parse(content) as AIRecommendation;
        return recommendation;
      } catch (parseError) {
        console.error(chalk.red(`Failed to parse AI recommendation: ${parseError}`));
        return null;
      }
    } catch (error: any) {
      console.error(chalk.red(`Error getting AI recommendation: ${error.message}`));
      return null;
    }
  }
  
  /**
   * Save optimization data to file for analysis
   */
  private saveOptimizationData(recommendation: AIRecommendation): void {
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
      console.log(chalk.green(`Optimization data saved to ${filePath}`));
    } catch (error: any) {
      console.error(chalk.red(`Error saving optimization data: ${error.message}`));
    }
  }
  
  /**
   * Reset parameters to defaults
   */
  public resetToDefaults(): void {
    this.currentParameters = { ...this.defaultParameters };
    console.log(chalk.yellow('Trading parameters reset to defaults'));
  }
}

/**
 * Factory function to create an AI trading strategy
 */
export async function createAITradingStrategy(
  tokenAddress: string,
  connection: Connection,
  initialMaxAmount: number | string,
  initialMinAmount: number | string,
  initialTimeBetween: number | string,
  initialNumBuys: number | string,
  useAi: boolean = false
): Promise<AITradingStrategy> {
  // Convert string parameters to numbers
  const maxAmount = typeof initialMaxAmount === 'string' ? parseFloat(initialMaxAmount) : initialMaxAmount;
  const minAmount = typeof initialMinAmount === 'string' ? parseFloat(initialMinAmount) : initialMinAmount;
  const timeBetween = typeof initialTimeBetween === 'string' ? parseInt(initialTimeBetween) : initialTimeBetween;
  const numBuys = typeof initialNumBuys === 'string' ? parseInt(initialNumBuys) : initialNumBuys;
  
  // Create initial parameters
  const initialParameters: TradingParameters = {
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