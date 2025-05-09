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
  isLowLiquidity: boolean;
  dataQuality: 'high' | 'medium' | 'low' | 'none';
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
  private solPrice: number = 150; // Default fallback price in USD
  
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
    console.log(chalk.magenta('==== AI STRATEGY UPDATE CALLED ===='));
    console.log(chalk.magenta(`Token Address: ${this.tokenAddress}`));
    console.log(chalk.magenta(`Last Updated: ${new Date(this.lastUpdated).toISOString()}`));
    console.log(chalk.magenta(`Update Interval: ${this.updateInterval / 1000} seconds`));
    console.log(chalk.magenta(`Time Since Last Update: ${(now - this.lastUpdated) / 1000} seconds`));
    
    // Only update if enough time has passed since the last update
    if (now - this.lastUpdated > this.updateInterval) {
      try {
        // Store the previous max amount for comparison
        const previousMaxAmount = this.currentParameters.maxAmount;
        
        // Fetch latest metrics
        const metrics = await this.fetchTokenMetrics();
        this.metrics = metrics;
        this.lastUpdated = now;
        
        // Add to history
        this.metricsHistory.push(metrics);
        if (this.metricsHistory.length > this.historyMaxLength) {
          this.metricsHistory.shift(); // Remove oldest entry
        }

        console.log(chalk.magenta(`Token Metrics: Liquidity: $${metrics.liquidity || 'Unknown'}`));
        console.log(chalk.magenta(`Token Metrics: Data Quality: ${metrics.dataQuality}`));
        console.log(chalk.magenta(`Token Metrics: Is Low Liquidity: ${metrics.isLowLiquidity}`));
        
        // Optimize parameters if AI is enabled
        if (this.useAi && this.openai) {
          console.log(chalk.magenta('Calling AI for recommendations...'));
          const recommendation = await this.getAIRecommendation();
          
          if (recommendation) {
            console.log(chalk.cyan('=== AI Trading Parameter Update ==='));
            console.log(chalk.blue(`Market Condition: ${recommendation.marketCondition}`));
            console.log(chalk.blue(`AI Confidence: ${recommendation.confidence.toFixed(2)}%`));
            console.log(chalk.blue(`Reasoning: ${recommendation.reasoning}`));
            
            // Only apply changes if confidence is high enough
            if (recommendation.confidence >= 70) {
              // Check if the recommended max amount is higher than before
              if (recommendation.parameters.maxAmount > previousMaxAmount) {
                console.log(chalk.yellow('⚠️ BALANCE ALERT: AI is recommending a higher max trade amount!'));
                console.log(chalk.yellow(`Previous max: ${previousMaxAmount} SOL → New max: ${recommendation.parameters.maxAmount} SOL`));
                console.log(chalk.yellow(`Make sure your wallets have enough SOL balance (at least ${(recommendation.parameters.maxAmount * 1.5).toFixed(2)} SOL recommended)`));
              }
              
              // Apply the new parameters
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
    
    // FORCE LIMITS EVEN IF AI RECOMMENDATIONS WEREN'T UPDATED
    // This ensures parameters are always appropriate for the token's liquidity
    if (this.metrics && this.metrics.liquidity !== undefined) {
      const previousMaxAmount = this.currentParameters.maxAmount;
      let maxAllowedAmount = 50;
      
      // Use strict liquidity tiers to determine max amounts
      if (this.metrics.liquidity < 10) {
        maxAllowedAmount = 0.05;
        console.log(chalk.red('ENFORCING LIMITS: Extremely low liquidity (<$10) - Max 0.05 SOL'));
      } else if (this.metrics.liquidity < 100) {
        maxAllowedAmount = 0.1;
        console.log(chalk.red('ENFORCING LIMITS: Very low liquidity (<$100) - Max 0.1 SOL'));
      } else if (this.metrics.liquidity < 500) {
        maxAllowedAmount = 0.5;
        console.log(chalk.red('ENFORCING LIMITS: Low liquidity (<$500) - Max 0.5 SOL'));
      } else if (this.metrics.liquidity < 1000) {
        maxAllowedAmount = 1;
        console.log(chalk.red('ENFORCING LIMITS: Moderately low liquidity (<$1000) - Max 1 SOL'));
      } else if (this.metrics.liquidity < 5000) {
        maxAllowedAmount = 5;
        console.log(chalk.red('ENFORCING LIMITS: Moderate liquidity (<$5000) - Max 5 SOL'));
      } else if (this.metrics.liquidity < 20000) {
        maxAllowedAmount = 10;
        console.log(chalk.red('ENFORCING LIMITS: Good liquidity (<$20000) - Max 10 SOL'));
      } else if (this.metrics.liquidity < 50000) {
        maxAllowedAmount = 20;
        console.log(chalk.red('ENFORCING LIMITS: High liquidity (<$50000) - Max 20 SOL'));
      } else if (this.metrics.liquidity < 200000) {
        maxAllowedAmount = 30;
        console.log(chalk.red('ENFORCING LIMITS: Very high liquidity (<$200000) - Max 30 SOL'));
      } else {
        maxAllowedAmount = 50;
        console.log(chalk.red('ENFORCING LIMITS: Extremely high liquidity (>$200000) - Max 50 SOL'));
      }
      
      // Apply the limits directly to currentParameters regardless of AI
      if (this.currentParameters.maxAmount > maxAllowedAmount) {
        this.currentParameters.maxAmount = maxAllowedAmount;
        console.log(chalk.red(`DIRECT OVERRIDE: Max amount set to ${maxAllowedAmount} SOL based on liquidity tier`));
      } else if (maxAllowedAmount > previousMaxAmount && maxAllowedAmount > this.currentParameters.maxAmount) {
        // If liquidity has increased, we may need higher balances
        console.log(chalk.yellow('⚠️ BALANCE ALERT: Liquidity has increased, allowing for higher trade amounts'));
        console.log(chalk.yellow(`Previous max: ${previousMaxAmount} SOL → New max: ${this.currentParameters.maxAmount} SOL`));
        console.log(chalk.yellow(`Make sure your wallets have enough SOL balance (at least ${(this.currentParameters.maxAmount * 1.5).toFixed(2)} SOL recommended)`));
      }
      
      // Set min amount to 10% of max amount
      const minAmount = Math.max(0.01, maxAllowedAmount * 0.1);
      if (this.currentParameters.minAmount > minAmount * 2 || this.currentParameters.minAmount < minAmount / 2) {
        this.currentParameters.minAmount = minAmount;
        console.log(chalk.red(`DIRECT OVERRIDE: Min amount set to ${minAmount} SOL (10% of max)`));
      }
    }
    
    // Final safety check to ensure parameters are reasonable
    if (this.currentParameters.maxAmount > 50) {
      console.log(chalk.red(`SAFETY CHECK: Reducing max amount from ${this.currentParameters.maxAmount} to 50 SOL (global maximum)`));
      this.currentParameters.maxAmount = 50;
    }
    
    if (this.currentParameters.minAmount < 0.01) {
      console.log(chalk.red(`SAFETY CHECK: Increasing min amount from ${this.currentParameters.minAmount} to 0.01 SOL (global minimum)`));
      this.currentParameters.minAmount = 0.01;
    }
    
    console.log(chalk.magenta('==== FINAL PARAMETERS FROM AI STRATEGY ===='));
    console.log(chalk.magenta(`Max Amount: ${this.currentParameters.maxAmount} SOL`));
    console.log(chalk.magenta(`Min Amount: ${this.currentParameters.minAmount} SOL`));
    console.log(chalk.magenta(`Time Between: ${this.currentParameters.timeBetween}ms`));
    console.log(chalk.magenta(`Number of Buys: ${this.currentParameters.numBuys}`));
    console.log(chalk.magenta('==========================================='));
    
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
      liquidity: 0,
      isLowLiquidity: true,
      dataQuality: 'none'
    };
    
    try {
      // Try to get current SOL price
      await this.fetchSolPrice();
      
      // Try DexScreener API first
      const dexScreenerUrl = `https://api.dexscreener.com/latest/dex/tokens/${this.tokenAddress}`;
      const response = await axios.get(dexScreenerUrl, { timeout: 10000 });
      
      if (response.data && response.data.pairs && response.data.pairs.length > 0) {
        const pair = response.data.pairs[0];
        
        metrics.price = parseFloat(pair.priceUsd) || 0;
        metrics.liquidity = parseFloat(pair.liquidity.usd) || 0;
        metrics.marketCap = parseFloat(pair.marketCap) || 0;
        metrics.volume24h = parseFloat(pair.volume.h24) || 0;
        metrics.priceChange1h = parseFloat(pair.priceChange.h1) || 0;
        metrics.priceChange24h = parseFloat(pair.priceChange.h24) || 0;
        metrics.tradeCount = pair.txns ? (pair.txns.h24Buy + pair.txns.h24Sell) : 0;
        
        // Calculate simple volatility based on price changes
        if (metrics.priceChange1h !== undefined && metrics.priceChange24h !== undefined) {
          metrics.volatility = Math.abs(metrics.priceChange1h) + Math.abs(metrics.priceChange24h / 24);
        }
        
        // Ensure liquidity can't be misrepresented
        console.log(chalk.blue(`Raw liquidity from DexScreener: $${metrics.liquidity}`));
        
        // Handle case where liquidity shows as 0 but data exists (workaround for bug)
        if (metrics.liquidity === 0 && metrics.price > 0) {
          console.log(chalk.yellow('DexScreener reported 0 liquidity but token has price data. Setting to conservative liquidity estimate.'));
          metrics.liquidity = 100; // Conservative default liquidity
        }
        
        // Determine if this is a low liquidity token
        metrics.isLowLiquidity = metrics.liquidity < 5000; // Consider < $5K as low liquidity
        metrics.dataQuality = 'high';
        
        spinner.succeed(`Token metrics fetched successfully for ${this.tokenAddress}`);
      } else {
        // No pair data found, try fallback method
        await this.fetchFallbackMetrics(metrics);
        metrics.isLowLiquidity = true;
        metrics.dataQuality = 'low';
        
        // IMPORTANT: When no data is found, explicitly set low liquidity values
        if (metrics.liquidity === 0 || metrics.liquidity === undefined) {
          metrics.liquidity = 1; // 1 USD liquidity for tokens with no data
          console.log(chalk.red(`WARNING: No liquidity data found for ${this.tokenAddress}. Setting to minimum value (1 USD).`));
        }
        
        spinner.warn('Limited data found for this token. Using fallback metrics.');
      }
    } catch (error: any) {
      spinner.fail(`Error fetching token metrics: ${error.message}`);
      
      // Try fallback method
      await this.fetchFallbackMetrics(metrics);
      metrics.isLowLiquidity = true;
      metrics.dataQuality = 'low';
      
      // IMPORTANT: Ensure we have some liquidity value
      if (metrics.liquidity === 0 || metrics.liquidity === undefined) {
        metrics.liquidity = 1; // 1 USD liquidity for tokens with no data
        console.log(chalk.red(`WARNING: Error fetching metrics for ${this.tokenAddress}. Setting liquidity to minimum value (1 USD).`));
      }
      
      // If we still have no data and previous metrics exist, use them
      if (((metrics.dataQuality as string) === 'none' || (metrics.dataQuality as string) === 'low') && this.metrics) {
        console.log(chalk.yellow('Using previous token metrics for optimization'));
        return this.metrics;
      }
    }
    
    return metrics;
  }
  
  /**
   * Fetch the current SOL price in USD
   */
  private async fetchSolPrice(): Promise<number> {
    try {
      // Try CoinGecko API first
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
        timeout: 5000
      });
      
      if (response.data && response.data.solana && response.data.solana.usd) {
        this.solPrice = response.data.solana.usd;
        console.log(chalk.blue(`Current SOL price: $${this.solPrice}`));
        return this.solPrice;
      }
    } catch (error) {
      // Try fallback API if CoinGecko fails
      try {
        const fallbackResponse = await axios.get('https://price.jup.ag/v4/price?ids=SOL', {
          timeout: 5000
        });
        
        if (fallbackResponse.data && fallbackResponse.data.data && fallbackResponse.data.data.SOL) {
          this.solPrice = fallbackResponse.data.data.SOL.price;
          console.log(chalk.blue(`Current SOL price: $${this.solPrice}`));
          return this.solPrice;
        }
      } catch (fallbackError) {
        console.log(chalk.yellow(`Could not fetch SOL price, using default: $${this.solPrice}`));
      }
    }
    
    return this.solPrice; // Return default or previously fetched price
  }
  
  /**
   * Attempt to fetch metrics from alternative sources when primary source fails
   */
  private async fetchFallbackMetrics(metrics: TokenMetrics): Promise<void> {
    try {
      // Try to get on-chain data since APIs failed
      // This is a simplified approach - in production you'd want more robust methods
      
      // Check if token has any liquidity pools on Jupiter or Raydium
      try {
        const jupiterUrl = `https://price.jup.ag/v4/price?ids=${this.tokenAddress}`;
        const jupResp = await axios.get(jupiterUrl, { timeout: 5000 });
        
        if (jupResp.data && jupResp.data.data && jupResp.data.data[this.tokenAddress]) {
          const tokenData = jupResp.data.data[this.tokenAddress];
          metrics.price = tokenData.price || 0;
          // Jupiter doesn't provide liquidity directly, but having a price is a good sign
          metrics.dataQuality = 'medium';
        }
      } catch (e) {
        console.log(chalk.yellow('Jupiter price API check failed'));
      }
      
      // If we have no price data at this point, token is likely very new/low liquidity
      if (metrics.price === 0) {
        // Set ultra-conservative defaults for new/unknown tokens
        metrics.price = 0.0000001; // Dummy value
        metrics.liquidity = 1; // Assume minimal liquidity (1 SOL)
        metrics.volume24h = 0;
        metrics.priceChange1h = 0;
        metrics.priceChange24h = 0;
        metrics.volatility = 0;
        metrics.isLowLiquidity = true;
        metrics.dataQuality = 'none';
      }
    } catch (error: any) {
      console.error(chalk.red(`Error in fallback metrics: ${error.message}`));
      metrics.dataQuality = 'none';
      metrics.isLowLiquidity = true;
    }
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
      
      console.log(chalk.cyan('=== DEBUG: AI RECOMMENDATION PROCESS STARTING ==='));
      console.log(chalk.cyan(`Token Address: ${tokenAddress}`));
      console.log(chalk.cyan(`Liquidity: $${currentMetrics.liquidity || 'Unknown'}`));
      console.log(chalk.cyan(`SOL Price: $${this.solPrice}`));
      
      // Market trend analysis
      let marketCondition = 'neutral';
      if (currentMetrics.priceChange24h !== undefined) {
        if (currentMetrics.priceChange24h > 5) marketCondition = 'bullish';
        else if (currentMetrics.priceChange24h < -5) marketCondition = 'bearish';
      }
      
      // Set liquidity tier for better recommendations
      let liquidityTier = 'unknown';
      let recommendedMaxAmount = '0.05-0.2';
      let exactMaxAmount = 0.2;
      
      // Extremely precise liquidity tiers with exact amounts
      if (currentMetrics.liquidity !== undefined) {
        if (currentMetrics.liquidity < 10) {
          liquidityTier = 'extremely low';
          recommendedMaxAmount = '0.01-0.05';
          exactMaxAmount = 0.05;
        } else if (currentMetrics.liquidity < 100) {
          liquidityTier = 'very low';
          recommendedMaxAmount = '0.05-0.1';
          exactMaxAmount = 0.1;
        } else if (currentMetrics.liquidity < 500) {
          liquidityTier = 'low';
          recommendedMaxAmount = '0.1-0.5';
          exactMaxAmount = 0.5;
        } else if (currentMetrics.liquidity < 1000) {
          liquidityTier = 'moderately low';
          recommendedMaxAmount = '0.5-1';
          exactMaxAmount = 1;
        } else if (currentMetrics.liquidity < 5000) {
          liquidityTier = 'moderate';
          recommendedMaxAmount = '1-5';
          exactMaxAmount = 5;
        } else if (currentMetrics.liquidity < 20000) {
          liquidityTier = 'good';
          recommendedMaxAmount = '5-10';
          exactMaxAmount = 10;
        } else if (currentMetrics.liquidity < 50000) {
          liquidityTier = 'high';
          recommendedMaxAmount = '10-20';
          exactMaxAmount = 20;
        } else if (currentMetrics.liquidity < 200000) {
          liquidityTier = 'very high';
          recommendedMaxAmount = '20-30';
          exactMaxAmount = 30;
        } else {
          liquidityTier = 'extremely high';
          recommendedMaxAmount = '30-50';
          exactMaxAmount = 50;
        }
      }
      
      // Prepare examples table based on liquidity tiers to show the model
      let examplesTable = '';
      if (currentMetrics.liquidity !== undefined) {
        const liquidity = currentMetrics.liquidity;
        
        // Create examples for tokens with similar liquidity
        examplesTable = `
EXAMPLES OF GOOD RECOMMENDATIONS FOR TOKENS WITH SIMILAR LIQUIDITY ($${liquidity}):

| Liquidity     | Max Amount (SOL) | Min Amount (SOL) | Time Between (ms) | Num Buys |
|---------------|------------------|------------------|-------------------|----------|
`;
        
        if (liquidity < 10) {
          examplesTable += `| $5            | 0.02             | 0.005            | 3000              | 3        |
| $8            | 0.05             | 0.01             | 2500              | 3        |`;
        } else if (liquidity < 100) {
          examplesTable += `| $50           | 0.08             | 0.015            | 2000              | 3        |
| $80           | 0.1              | 0.02             | 1800              | 3        |`;
        } else if (liquidity < 500) {
          examplesTable += `| $250          | 0.3              | 0.05             | 1500              | 4        |
| $400          | 0.5              | 0.07             | 1200              | 4        |`;
        } else if (liquidity < 1000) {
          examplesTable += `| $750          | 0.8              | 0.1              | 1200              | 4        |
| $900          | 1.0              | 0.15             | 1000              | 5        |`;
        } else if (liquidity < 5000) {
          examplesTable += `| $2,500        | 3.0              | 0.4              | 800               | 5        |
| $4,000        | 5.0              | 0.5              | 700               | 6        |`;
        } else if (liquidity < 20000) {
          examplesTable += `| $10,000       | 8.0              | 0.8              | 600               | 6        |
| $15,000       | 10.0             | 1.0              | 500               | 7        |`;
        } else if (liquidity < 50000) {
          examplesTable += `| $30,000       | 15.0             | 1.5              | 400               | 8        |
| $45,000       | 20.0             | 2.0              | 350               | 8        |`;
        } else if (liquidity < 200000) {
          examplesTable += `| $100,000      | 25.0             | 2.5              | 300               | 9        |
| $150,000      | 30.0             | 3.0              | 250               | 10       |`;
        } else {
          examplesTable += `| $250,000      | 40.0             | 4.0              | 200               | 10       |
| $500,000+     | 50.0             | 5.0              | 150               | 10       |`;
        }
      }
      
      // For low liquidity or new tokens, add specialized context
      let additionalContext = '';
      if (currentMetrics.isLowLiquidity || currentMetrics.dataQuality === 'low' || currentMetrics.dataQuality === 'none') {
        additionalContext = `
IMPORTANT: This appears to be a ${liquidityTier.toUpperCase()} LIQUIDITY token or a token with LIMITED DATA AVAILABLE.
Data Quality: ${currentMetrics.dataQuality}
Estimated Liquidity: $${currentMetrics.liquidity || '< 1'} 
Liquidity Tier: ${liquidityTier}

KEY OBJECTIVE: Wake up this flat/dead token by creating strategic trading activity to attract new investors and generate momentum.

For this liquidity tier, optimize for:
1. APPROPRIATE trade sizes (recommended max ${recommendedMaxAmount} SOL per trade)
2. Longer intervals between trades (1000-3000ms minimum)
3. Fewer buys per cycle (3-5 maximum)
4. Higher sell thresholds to account for price impact
5. Conservative risk management
6. Pattern creation (e.g., regularly timed small buys to create visible chart patterns)
7. Volume building without significantly moving price (avoid large price impact)
`;
      } else {
        additionalContext = `
LIQUIDITY ASSESSMENT: This token has ${liquidityTier.toUpperCase()} LIQUIDITY.
Estimated Liquidity: $${currentMetrics.liquidity || 'Unknown'}
Liquidity Tier: ${liquidityTier}

For this liquidity tier, appropriate trade sizes are around ${recommendedMaxAmount} SOL per trade.
`;
      }
      
      // Create a more structured, clear prompt with examples
      const promptContent = `You are tasked with providing PRECISE trading parameters for a Solana memecoin trading bot.

TOKEN INFORMATION:
- Address: ${tokenAddress}
- Current Market Condition: ${marketCondition}
- Price: $${currentMetrics.price || 'Unknown'}
- 24h Price Change: ${currentMetrics.priceChange24h !== undefined ? currentMetrics.priceChange24h + '%' : 'Unknown'}
- 24h Volume: $${currentMetrics.volume24h || 'Unknown'}
- Liquidity: $${currentMetrics.liquidity || 'Unknown'}
- Liquidity Tier: ${liquidityTier}
- Data Quality: ${currentMetrics.dataQuality}

${additionalContext}

${examplesTable}

IMPORTANT NOTE ABOUT UNITS: 
- All trade amounts must be specified in SOL (not USD)
- Current SOL price: $${this.solPrice} USD
- For this token with $${currentMetrics.liquidity || 'Unknown'} liquidity, the maximum trade size should be ${exactMaxAmount} SOL (worth approximately $${(exactMaxAmount * this.solPrice).toFixed(2)} USD)

YOUR TASK:
Provide optimized trading parameters that strictly adhere to these guidelines:
1. Maximum trade size: ${exactMaxAmount} SOL (do not exceed this)
2. Minimum trade size: Between ${(exactMaxAmount * 0.05).toFixed(2)}-${(exactMaxAmount * 0.2).toFixed(2)} SOL (5-20% of max)
3. Time between trades: At least ${currentMetrics.liquidity && currentMetrics.liquidity < 1000 ? '1500' : '500'}ms
4. Number of buys: ${currentMetrics.liquidity && currentMetrics.liquidity < 1000 ? '3-5' : '5-10'} depending on market conditions

Format your response as a JSON object with these fields:
{
  "parameters": {
    "maxAmount": ${exactMaxAmount},
    "minAmount": number, 
    "timeBetween": number,
    "numBuys": number,
    "buyBatchSize": number,
    "sellThreshold": number,
    "stopLoss": number,
    "takeProfit": number
  },
  "reasoning": "brief explanation of how these parameters will help optimize trading for this token's liquidity level",
  "confidence": number,
  "marketCondition": "bullish|bearish|neutral|volatile|rangebound"
}

Note that I have ALREADY specified the maxAmount as ${exactMaxAmount} SOL in the template above, which is the correct value for this token's liquidity. DO NOT CHANGE THIS VALUE.`;

      // Get AI recommendation with more restrictive system message
      console.log(chalk.cyan('Sending request to OpenAI...'));
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { 
            role: "system", 
            content: `You are an expert Solana memecoin trading bot optimizer. You have deep expertise in liquidity-appropriate trading parameters.

CRITICAL INSTRUCTION:
1. You MUST set maxAmount to EXACTLY what is specified in the template (DO NOT MODIFY IT)
2. All values should be specified in SOL (not USD)
3. Your recommendations MUST be appropriate for the token's liquidity tier
4. You are only providing parameter recommendations, not executing trades

Remember that incorrect trade sizes relative to liquidity can cause significant issues including slippage or failing to generate proper momentum.`
          },
          { role: "user", content: promptContent }
        ],
        temperature: 0.1, // Very low temperature for more deterministic responses
        response_format: { type: "json_object" }
      });
      
      console.log(chalk.cyan('Received response from OpenAI'));
      
      const content = response.choices[0].message.content;
      
      if (!content) {
        console.log(chalk.yellow('Empty response from AI recommendation system'));
        return null;
      }
      
      try {
        console.log(chalk.cyan('Parsing AI response content:'));
        console.log(content);
        
        const recommendation = JSON.parse(content) as AIRecommendation;
        
        console.log(chalk.cyan('AI recommended parameters:'));
        console.log(chalk.cyan(`Max Amount: ${recommendation.parameters.maxAmount} SOL`));
        console.log(chalk.cyan(`Min Amount: ${recommendation.parameters.minAmount} SOL`));
        console.log(chalk.cyan(`Time Between: ${recommendation.parameters.timeBetween}ms`));
        console.log(chalk.cyan(`Number of Buys: ${recommendation.parameters.numBuys}`));
        
        // Verify the AI followed instructions for max amount
        if (recommendation.parameters.maxAmount !== exactMaxAmount) {
          console.log(chalk.red(`AI didn't follow instructions for maxAmount. Fixing value from ${recommendation.parameters.maxAmount} to ${exactMaxAmount} SOL`));
          recommendation.parameters.maxAmount = exactMaxAmount;
        } else {
          console.log(chalk.green(`AI correctly used maxAmount: ${exactMaxAmount} SOL`));
        }
        
        // Add safety limits based on liquidity tier
        if (currentMetrics.liquidity !== undefined) {
          // Minimum amount should be 5-20% of max
          const minRecommendedAmount = Math.max(0.01, exactMaxAmount * 0.05);
          const maxRecommendedMin = exactMaxAmount * 0.2;
          const originalMin = recommendation.parameters.minAmount;
          
          // Ensure min is within appropriate range for the max
          if (recommendation.parameters.minAmount < minRecommendedAmount || recommendation.parameters.minAmount > maxRecommendedMin) {
            // Set to middle of the range if outside bounds
            recommendation.parameters.minAmount = Math.min(Math.max(recommendation.parameters.minAmount, minRecommendedAmount), maxRecommendedMin);
            console.log(chalk.yellow(`ENFORCED: Adjusted min amount from ${originalMin} to ${recommendation.parameters.minAmount} SOL (5-20% of max)`));
          }
          
          // Ensure minimum time between trades based on liquidity
          let minTimeBetween = 300; // Default for high liquidity
          
          if (currentMetrics.liquidity < 10000) {
            minTimeBetween = 1500; // Very low liquidity needs more time
          } else if (currentMetrics.liquidity < 50000) {
            minTimeBetween = 1000; // Low liquidity
          } else if (currentMetrics.liquidity < 200000) {
            minTimeBetween = 500; // Moderate liquidity
          }
          
          if (recommendation.parameters.timeBetween < minTimeBetween) {
            const originalTime = recommendation.parameters.timeBetween;
            recommendation.parameters.timeBetween = minTimeBetween;
            console.log(chalk.yellow(`ENFORCED: Increased time between trades from ${originalTime}ms to ${minTimeBetween}ms`));
          }
          
          // Limit number of buys based on liquidity
          let maxBuys = 10; // Default for high liquidity
          
          if (currentMetrics.liquidity < 10000) {
            maxBuys = 3; // Very low liquidity
          } else if (currentMetrics.liquidity < 50000) {
            maxBuys = 5; // Low liquidity
          } else if (currentMetrics.liquidity < 200000) {
            maxBuys = 8; // Moderate liquidity
          }
          
          if (recommendation.parameters.numBuys > maxBuys) {
            const originalBuys = recommendation.parameters.numBuys;
            recommendation.parameters.numBuys = maxBuys;
            console.log(chalk.yellow(`ENFORCED: Reduced number of buys from ${originalBuys} to ${maxBuys}`));
          }
        }
        
        console.log(chalk.cyan('Final AI recommendation parameters after enforcement:'));
        console.log(chalk.cyan(`Max Amount: ${recommendation.parameters.maxAmount} SOL`));
        console.log(chalk.cyan(`Min Amount: ${recommendation.parameters.minAmount} SOL`));
        console.log(chalk.cyan(`Time Between: ${recommendation.parameters.timeBetween}ms`));
        console.log(chalk.cyan(`Number of Buys: ${recommendation.parameters.numBuys}`));
        console.log(chalk.cyan('=== DEBUG: AI RECOMMENDATION PROCESS COMPLETE ==='));
        
        return recommendation;
      } catch (parseError) {
        console.error(chalk.red(`Failed to parse AI recommendation: ${parseError}`));
        return null;
      }
    } catch (error: any) {
      console.error(chalk.red(`Error getting AI recommendation: ${error.message}`));
      if (error.response) {
        console.error(chalk.red(`OpenAI API Error: ${JSON.stringify(error.response.data || {})}`));
      }
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