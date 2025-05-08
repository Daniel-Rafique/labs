import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import ora from 'ora';
import chalk from 'chalk';
import * as os from 'os';
import { decode as base58Decode } from 'bs58';
import { createAITradingStrategy, AITradingStrategy } from './utils/aiTradingStrategy';
import { getProxyManager, ProxyManager } from './utils/proxyManager';
import axios, { AxiosRequestConfig } from 'axios';
import { 
  getRandomizedTradeSize, 
  getRandomizedTradeDelay, 
  selectWalletForTrade,
  adaptToMarketConditions,
  generateBalancedOrderPattern,
  generateConsistentSessionId
} from './utils/botDetectionAvoidance';
import { AccountLayout } from '@solana/spl-token';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from './lib/solana/token-compat';

// Load environment variables
dotenv.config();

interface WalletData {
  publicKey: string;
  secretKey: string;
  apiKey?: string;
  balance?: number;
  lastUsed?: number;
}

interface MarketMetrics {
  volume24h?: number;
  priceChange24h?: number;
  liquidity?: number;
  volatility?: number;
  isUptrend?: boolean;
  lastUpdated?: number;
}

class TradingBot {
  private rpcEndpoint: string;
  private connection: Connection;
  private wallets: WalletData[] = [];
  private walletKeypairs: Keypair[] = [];
  private tokenAddress: string;
  private maxTradeAmount: number;
  private minTradeAmount: number;
  private timeBetweenBuys: number;
  private numberOfBuys: number;
  private numberOfCycles: number;
  private currentCycle: number = 1;
  private isJitoMode: boolean;
  private useAiOptimization: boolean;
  private useProxies: boolean;
  private proxyManager: ProxyManager;
  private aiStrategy: AITradingStrategy | null = null;
  private lastParameterUpdate: number = 0;
  private parameterUpdateInterval: number = 5 * 60 * 1000; // 5 minutes
  private isRunning: boolean = false;
  private logger: any;
  private walletsToProxies: Map<string, string> = new Map(); // Map wallet public keys to session IDs
  private currentWalletIndex: number = 0;
  private marketMetrics: MarketMetrics = {};
  private metricUpdateInterval: number = 10 * 60 * 1000; // 10 minutes
  private lastMetricUpdate: number = 0;
  private orderPattern: Array<'buy' | 'sell'> = [];
  private currentOrderIndex: number = 0;
  private walletRotationStrategy: 'random' | 'sequential' | 'weighted' = 'random';
  private minDelaySeconds: number = 40;  // Default minimum delay in seconds
  private maxDelaySeconds: number = 120; // Default maximum delay in seconds
  private adaptiveTrading: boolean = true; // Enable adaptive trading by default

  constructor() {
    // Initialize logger
    this.logger = {
      info: (message: string) => console.log(message),
      warn: (message: string) => console.warn(message),
      error: (message: string) => console.error(message),
      debug: (message: string) => console.debug(message)
    };

    // Load configuration from environment variables
    this.tokenAddress = process.env.CONTRACT_ADDRESS || process.env.TOKEN_MINT_ADDRESS || '';
    
    // Use realistic range for trade amounts (0.8 to 2.3 SOL as default range)
    this.maxTradeAmount = parseFloat(process.env.MAX_TRADE_AMOUNT || '2.3');
    this.minTradeAmount = parseFloat(process.env.MIN_TRADE_AMOUNT || '0.8');
    
    // Implement variable trade timing (40-120 seconds)
    this.minDelaySeconds = parseInt(process.env.MIN_DELAY_SECONDS || '40');
    this.maxDelaySeconds = parseInt(process.env.MAX_DELAY_SECONDS || '120');
    this.timeBetweenBuys = parseInt(process.env.TIME_BETWEEN_BUYS || '60000');
    
    this.numberOfBuys = parseInt(process.env.NUMBER_OF_BUYS || '3');
    this.numberOfCycles = parseInt(process.env.NUMBER_OF_CYCLES || '1');
    this.isJitoMode = process.env.JITO === 'true';
    this.useAiOptimization = process.env.USE_AI_OPTIMIZATION === 'true';
    this.useProxies = process.env.USE_PROXIES === 'true';
    
    // Load anti-detection settings
    this.walletRotationStrategy = (process.env.WALLET_ROTATION_STRATEGY as any) || 'random';
    this.adaptiveTrading = process.env.ADAPTIVE_TRADING !== 'false';

    // Initialize proxy manager
    this.proxyManager = getProxyManager();
    
    // Check if proxies are configured but not explicitly enabled via env variable
    if (this.proxyManager.isEnabled() && process.env.USE_PROXIES === undefined) {
      this.useProxies = true; // Enable proxies if they're configured
    }

    // Initialize RPC connection
    this.rpcEndpoint = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
    this.connection = new Connection(this.rpcEndpoint, 'confirmed');

    // Validate configuration
    this.validateConfiguration();
    
    // Generate initial order pattern for 20 orders
    this.orderPattern = generateBalancedOrderPattern(20);
  }

  private validateConfiguration(): void {
    // Validate token address
    if (!this.tokenAddress) {
      throw new Error('Contract address is required. Please set CONTRACT_ADDRESS in your .env file.');
    }

    try {
      new PublicKey(this.tokenAddress);
    } catch (error) {
      throw new Error('Invalid contract address. Please provide a valid Solana address.');
    }

    // Validate trading parameters
    if (isNaN(this.maxTradeAmount) || this.maxTradeAmount <= 0) {
      throw new Error('Invalid MAX_TRADE_AMOUNT. Please provide a positive number.');
    }

    if (isNaN(this.minTradeAmount) || this.minTradeAmount <= 0 || this.minTradeAmount >= this.maxTradeAmount) {
      throw new Error('Invalid MIN_TRADE_AMOUNT. Please provide a positive number less than MAX_TRADE_AMOUNT.');
    }

    if (isNaN(this.timeBetweenBuys) || this.timeBetweenBuys < 0) {
      throw new Error('Invalid TIME_BETWEEN_BUYS. Please provide a non-negative number.');
    }

    if (isNaN(this.numberOfBuys) || this.numberOfBuys <= 0) {
      throw new Error('Invalid NUMBER_OF_BUYS. Please provide a positive number.');
    }

    if (isNaN(this.numberOfCycles) || this.numberOfCycles <= 0) {
      throw new Error('Invalid NUMBER_OF_CYCLES. Please provide a positive number.');
    }

    this.logger.info('Configuration validated successfully');
  }

  private async loadWallets(): Promise<void> {
    try {
      // Determine wallet file path
      const walletFilePath = this.resolveWalletPath();
      
      if (!fs.existsSync(walletFilePath)) {
        throw new Error(`Wallet file not found at: ${walletFilePath}`);
      }

      const data = fs.readFileSync(walletFilePath, 'utf8');
      this.wallets = JSON.parse(data);
      
      if (!Array.isArray(this.wallets) || this.wallets.length === 0) {
        throw new Error('Invalid wallet data - must be a non-empty array');
      }
      
      // Convert wallet data to keypairs
      this.walletKeypairs = this.wallets.map(wallet => {
        const secretKey = base58Decode(wallet.secretKey);
        return Keypair.fromSecretKey(secretKey);
      });
      
      // If using proxies, assign each wallet a unique session ID
      if (this.useProxies && this.proxyManager.isEnabled()) {
        this.assignProxySessions();
      }
      
      // For bot detection avoidance, limit to 3-5 wallets for trading
      const maxWalletsToUse = Math.min(this.wallets.length, Math.floor(Math.random() * 3) + 3); // 3-5 wallets
      
      this.logger.info(`Successfully loaded ${this.wallets.length} wallets (using ${maxWalletsToUse} for trading)`);
      
      // Initialize wallet balances
      await this.updateWalletBalances();
    } catch (error: any) {
      this.logger.error(`Failed to load wallets: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update the SOL balance for each wallet
   */
  private async updateWalletBalances(): Promise<void> {
    try {
      for (let i = 0; i < this.walletKeypairs.length; i++) {
        const wallet = this.walletKeypairs[i];
        const balance = await this.connection.getBalance(wallet.publicKey);
        this.wallets[i].balance = balance / 1e9; // Convert lamports to SOL
      }
      this.logger.info('Updated wallet balances');
    } catch (error: any) {
      this.logger.warn(`Failed to update wallet balances: ${error.message}`);
    }
  }

  /**
   * Assign unique proxy session IDs to each wallet
   * This helps maintain consistent IPs per wallet
   */
  private assignProxySessions(): void {
    this.walletsToProxies.clear();
    
    for (const wallet of this.walletKeypairs) {
      const publicKey = wallet.publicKey.toString();
      // Use consistent session ID for each wallet
      const sessionId = generateConsistentSessionId(publicKey);
      this.walletsToProxies.set(publicKey, sessionId);
    }
    
    this.logger.info(`Assigned proxy sessions to ${this.walletsToProxies.size} wallets`);
  }

  /**
   * Get a proxy configuration for a specific wallet
   */
  private getProxyConfigForWallet(wallet: Keypair): AxiosRequestConfig {
    if (!this.useProxies || !this.proxyManager.isEnabled()) {
      return {}; // Return empty config if proxies not enabled
    }
    
    const publicKey = wallet.publicKey.toString();
    const sessionId = this.walletsToProxies.get(publicKey);
    
    // Generate a random country from this list for more organic traffic patterns
    const countries = ['US', 'GB', 'DE', 'FR', 'CA', 'AU', 'JP', 'IT', 'ES'];
    const randomCountry = countries[Math.floor(Math.random() * countries.length)];
    
    // If we have a session ID for this wallet, use it to maintain consistent IP
    if (sessionId) {
      return this.proxyManager.getAxiosConfig(randomCountry, undefined, sessionId);
    } else {
      // Otherwise just rotate to get a fresh IP
      this.proxyManager.rotateProxy();
      return this.proxyManager.getAxiosConfig(randomCountry);
    }
  }

  private resolveWalletPath(): string {
    // Get project root directory
    const projectRootDir = path.resolve(__dirname, '..');
    
    // Use the .config directory in the project root
    const projectConfigDir = path.join(projectRootDir, '.config');
    const projectWalletPath = path.join(projectConfigDir, 'wallets.json');
    
    // If the project wallet file exists, use it
    if (fs.existsSync(projectWalletPath)) {
      return projectWalletPath;
    }
    
    // Otherwise fall back to the server path structure
    const homeDir = os.homedir();
    const directory = process.env.WALLET_DIRECTORY || 'user';
    const basePath = path.join(homeDir, 'marketMaker', 'instances', directory);
    return path.join(basePath, '.config', 'wallets.json');
  }

  private async initializeAIStrategy(): Promise<void> {
    if (!this.useAiOptimization) return;

    try {
      const spinner = ora('Initializing AI trading strategy...').start();
      
      this.aiStrategy = await createAITradingStrategy(
        this.tokenAddress,
        this.connection,
        this.maxTradeAmount,
        this.minTradeAmount,
        this.timeBetweenBuys,
        this.numberOfBuys,
        true // useAI
      );
      
      spinner.succeed('AI trading strategy initialized successfully');
      
      // Do an initial update to get recommendations
      await this.updateTradingParameters();
    } catch (error: any) {
      this.logger.error(`Failed to initialize AI strategy: ${error.message}`);
      this.useAiOptimization = false;
      this.logger.warn('AI optimization disabled due to initialization failure');
    }
  }

  private async updateTradingParameters(): Promise<void> {
    if (!this.useAiOptimization || !this.aiStrategy) return;
    
    const now = Date.now();
    if (now - this.lastParameterUpdate < this.parameterUpdateInterval) return;
    
    try {
      const updatedParams = await this.aiStrategy.update();
      
      // Apply the updated parameters
      this.minTradeAmount = updatedParams.minAmount;
      this.maxTradeAmount = updatedParams.maxAmount;
      this.timeBetweenBuys = updatedParams.timeBetween;
      this.numberOfBuys = updatedParams.numBuys;
      
      this.lastParameterUpdate = now;
      
      this.logger.info('Trading parameters updated via AI optimization');
      this.logger.info(`New min/max trade amount: ${this.minTradeAmount}/${this.maxTradeAmount} SOL`);
      this.logger.info(`New time between buys: ${this.timeBetweenBuys}ms`);
      this.logger.info(`New number of buys: ${this.numberOfBuys}`);
    } catch (error: any) {
      this.logger.error(`Failed to update trading parameters: ${error.message}`);
    }
  }
  
  /**
   * Update market metrics for adaptive trading
   */
  private async updateMarketMetrics(): Promise<void> {
    const now = Date.now();
    if (!this.adaptiveTrading || now - this.lastMetricUpdate < this.metricUpdateInterval) return;
    
    try {
      // If using AI strategy, update it first to keep its internal state fresh
      if (this.aiStrategy) {
        await this.aiStrategy.update();
      }
      
      // Always fetch market metrics directly from the API
      try {
        const dexScreenerUrl = `https://api.dexscreener.com/latest/dex/tokens/${this.tokenAddress}`;
        const response = await axios.get(dexScreenerUrl, { timeout: 10000 });
        
        if (response.data && response.data.pairs && response.data.pairs.length > 0) {
          const pair = response.data.pairs[0];
          this.marketMetrics = {
            volume24h: parseFloat(pair.volume.h24),
            priceChange24h: parseFloat(pair.priceChange.h24),
            liquidity: parseFloat(pair.liquidity.usd),
            volatility: Math.abs(parseFloat(pair.priceChange.h1)),
            isUptrend: parseFloat(pair.priceChange.h24) > 0,
            lastUpdated: now
          };
          
          this.logger.info(`Updated market metrics: volume=${this.marketMetrics.volume24h}, price change=${this.marketMetrics.priceChange24h}%`);
        } else {
          this.logger.warn('No trading pairs found for this token in DexScreener API');
        }
      } catch (error: any) {
        this.logger.warn(`Failed to fetch market metrics: ${error.message}`);
      }
      
      this.lastMetricUpdate = now;
      
      // Adjust trading parameters based on market conditions
      if (this.adaptiveTrading && this.marketMetrics.liquidity !== undefined) {
        const adaptedParams = adaptToMarketConditions(
          {
            minTradeAmount: this.minTradeAmount,
            maxTradeAmount: this.maxTradeAmount,
            minTradeDelay: this.minDelaySeconds,
            maxTradeDelay: this.maxDelaySeconds
          },
          this.marketMetrics
        );
        
        // Update trading parameters based on market conditions
        this.minTradeAmount = adaptedParams.minTradeAmount;
        this.maxTradeAmount = adaptedParams.maxTradeAmount;
        this.minDelaySeconds = adaptedParams.minTradeDelay;
        this.maxDelaySeconds = adaptedParams.maxTradeDelay;
        
        this.logger.info('Trading parameters adjusted based on market conditions:');
        this.logger.info(`Trade size: ${this.minTradeAmount.toFixed(4)}-${this.maxTradeAmount.toFixed(4)} SOL`);
        this.logger.info(`Delay range: ${this.minDelaySeconds}-${this.maxDelaySeconds} seconds`);
      }
    } catch (error: any) {
      this.logger.error(`Error updating market metrics: ${error.message}`);
    }
  }

  private async executeTrade(wallet: Keypair, amount: number): Promise<boolean> {
    try {
      // Check if wallet has enough balance
      const walletIndex = this.walletKeypairs.findIndex(w => w.publicKey.equals(wallet.publicKey));
      if (walletIndex === -1) {
        throw new Error('Wallet not found in list');
      }
      
      const walletData = this.wallets[walletIndex];
      if (!walletData.balance || walletData.balance < amount) {
        this.logger.warn(`Wallet ${wallet.publicKey.toString().slice(0, 8)}... has insufficient balance for trade of ${amount} SOL`);
        return false;
      }
      
      // Get the order type from the pattern (buy/sell)
      const orderType = this.orderPattern[this.currentOrderIndex % this.orderPattern.length];
      this.currentOrderIndex++;
      
      // If we've used most of the pattern, generate a new one
      if (this.currentOrderIndex >= this.orderPattern.length - 5) {
        this.orderPattern = generateBalancedOrderPattern(20);
        this.currentOrderIndex = 0;
      }
      
      this.logger.info(`Executing ${orderType} with wallet ${wallet.publicKey.toString().slice(0, 8)}... (${amount.toFixed(4)} SOL)`);
      
      // Track that this wallet was used
      walletData.lastUsed = Date.now();
      
      // TODO: Implement actual trade execution through your trading API
      // This is a placeholder that would need to be replaced with actual trading logic
      
      // Simulate trade execution
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update wallet balance (simulated)
      if (orderType === 'buy') {
        // Simulate balance reduction after buy
        walletData.balance -= amount;
      } else {
        // Simulate balance increase after sell
        walletData.balance += amount * 0.98; // Accounting for some fees
      }
      
      this.logger.info(`${orderType.toUpperCase()} completed successfully`);
      return true;
    } catch (error: any) {
      this.logger.error(`Trade execution error: ${error.message}`);
      return false;
    }
  }

  /**
   * Get token balances for a specific wallet
   * @param wallet The wallet keypair
   * @returns Array of tokens with their balances
   */
  private async getWalletTokenBalances(wallet: Keypair): Promise<Array<{mint: string, amount: number, decimals: number}>> {
    try {
      // Get token accounts for both standard program and token-2022 program
      const tokenList = [];
      
      for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
        try {
          const tokenAccounts = await this.connection.getTokenAccountsByOwner(
            wallet.publicKey, 
            { programId }
          );
          
          for (const { pubkey, account } of tokenAccounts.value) {
            try {
              // Get the token account balance
              const accountInfo = await this.connection.getTokenAccountBalance(pubkey);
              
              if (accountInfo && Number(accountInfo.value.amount) > 0) {
                // Parse the token account data to get the mint address
                const accountData = AccountLayout.decode(account.data);
                const mintAddress = new PublicKey(accountData.mint);
                
                tokenList.push({
                  mint: mintAddress.toString(),
                  amount: Number(accountInfo.value.amount),
                  decimals: accountInfo.value.decimals
                });
              }
            } catch (error) {
              this.logger.warn(`Error getting token account info: ${error}`);
            }
          }
        } catch (error) {
          this.logger.warn(`Error getting token accounts for program: ${error}`);
        }
      }
      
      return tokenList;
    } catch (error: any) {
      this.logger.error(`Failed to get token balances: ${error.message}`);
      return [];
    }
  }

  /**
   * Sell tokens to rebalance a wallet's SOL balance
   * @param wallet The wallet keypair
   * @returns Boolean indicating if rebalancing was successful
   */
  private async rebalanceWallet(wallet: Keypair): Promise<boolean> {
    try {
      // Get wallet index
      const walletIndex = this.walletKeypairs.findIndex(w => w.publicKey.equals(wallet.publicKey));
      if (walletIndex === -1) {
        throw new Error('Wallet not found in list');
      }
      
      const walletData = this.wallets[walletIndex];
      const solBalance = walletData.balance || 0;
      
      // Only rebalance if SOL balance is below minimum trade amount
      if (solBalance >= this.minTradeAmount) {
        return false; // No need to rebalance
      }
      
      this.logger.info(`Rebalancing wallet ${wallet.publicKey.toString().slice(0, 8)}... with low SOL balance (${solBalance.toFixed(4)} SOL)`);
      
      // Make sure we have a token address to trade
      if (!this.tokenAddress) {
        this.logger.warn('No token address specified for trading, cannot rebalance');
        return false;
      }
      
      // Get token balances
      const tokens = await this.getWalletTokenBalances(wallet);
      
      if (tokens.length === 0) {
        this.logger.info(`No tokens to sell in wallet ${wallet.publicKey.toString().slice(0, 8)}...`);
        return false;
      }
      
      // Find the specific token we're trading
      const tradingToken = tokens.find(token => token.mint === this.tokenAddress);
      
      if (!tradingToken) {
        this.logger.info(`The trading token (${this.tokenAddress.slice(0, 8)}...) is not found in wallet ${wallet.publicKey.toString().slice(0, 8)}...`);
        return false;
      }
      
      this.logger.info(`Found trading token ${this.tokenAddress.slice(0, 8)}... to sell for rebalancing`);
      
      // Determine target SOL amount needed
      // We want to have enough for at least one minimum trade plus a buffer
      const targetSolAmount = this.minTradeAmount * 1.5;
      const solNeeded = targetSolAmount - solBalance;
      
      this.logger.info(`Need to recover ${solNeeded.toFixed(4)} SOL for optimal trading`);
      
      // If AI optimization is enabled, use it to determine token selling strategy
      let sellPercentage = 50; // Default to selling 50% of tokens
      
      if (this.useAiOptimization && this.aiStrategy) {
        try {
          // Get market information from AI strategy
          await this.aiStrategy.update();
          
          // Determine if market is in uptrend or not
          const isUptrend = this.marketMetrics.isUptrend === true;
          const highVolatility = this.marketMetrics.volatility !== undefined && this.marketMetrics.volatility > 5;
          
          // For uptrending markets, sell less of tokens
          // For downtrending or highly volatile markets, sell more
          if (isUptrend && !highVolatility) {
            sellPercentage = 25;  // Sell only 25% in uptrend to keep most tokens
            this.logger.info('AI determined market is in uptrend - selling only 25% of tokens');
          } else if (highVolatility) {
            sellPercentage = 50;  // Sell 50% in volatile markets
            this.logger.info('AI determined market is volatile - selling 50% of tokens');
          } else {
            sellPercentage = 75;  // Sell 75% in downtrend
            this.logger.info('AI determined market is in downtrend - selling 75% of tokens');
          }
        } catch (error: any) {
          this.logger.warn(`AI optimization error during rebalancing: ${error.message}, using default strategy`);
        }
      }
      
      try {
        this.logger.info(`Attempting to sell ${sellPercentage}% of trading token ${this.tokenAddress.slice(0, 8)}... to rebalance wallet`);
        
        // Calculate sell amount based on our determined strategy
        const sellAmount = Math.floor(tradingToken.amount * (sellPercentage / 100));
        
        // Make sure we have something to sell
        if (sellAmount <= 0) {
          this.logger.warn(`Token amount too small to sell partial amount, trying 100% instead`);
          sellPercentage = 100;
        }
        
        // Prepare sell data
        const data = {
          publicKey: wallet.publicKey.toString(),
          action: 'sell',
          mint: this.tokenAddress,
          denominatedInSol: 'true',
          amount: sellPercentage === 100 ? '100' : sellAmount.toString(), // Sell percentage determined by AI or market conditions
          slippage: 1,
          priorityFee: 0.00003,
          pool: 'auto' // Use auto pool selection
        };
        
        // In a real implementation, this would call your trading API to sell the token
        // For simulation, just add SOL to wallet balance and remove token
        const estimatedSolGain = Math.min(solNeeded, 0.05); // Simulate getting up to needed SOL (max 0.05 SOL)
        walletData.balance = (walletData.balance || 0) + estimatedSolGain;
        
        this.logger.info(`Successfully rebalanced wallet by selling ${sellPercentage}% of trading token. New SOL balance: ${walletData.balance.toFixed(4)} SOL`);
        
        return walletData.balance >= this.minTradeAmount;
      } catch (error: any) {
        this.logger.error(`Failed to sell trading token ${this.tokenAddress.slice(0, 8)}...: ${error.message}`);
        return false;
      }
    } catch (error: any) {
      this.logger.error(`Rebalance error: ${error.message}`);
      return false;
    }
  }

  private async processWallet(): Promise<boolean> {
    try {
      // Before starting, check if ANY wallets have sufficient balance
      const sufficientBalanceWallets = this.wallets.filter(wallet => 
        wallet.balance && wallet.balance >= this.minTradeAmount
      );
      
      if (sufficientBalanceWallets.length === 0) {
        this.logger.error('All wallets have insufficient balance. Stopping trading.');
        return false;
      }
      
      // Keep track of wallets we've tried in this process call
      const triedWalletIndices = new Set<number>();
      let success = false;
      
      // Loop until we either succeed with a wallet or try all wallets with sufficient balance
      while (!success && triedWalletIndices.size < this.walletKeypairs.length) {
        // Choose a wallet based on the selected strategy
        const walletIndex = selectWalletForTrade(
          this.wallets, 
          this.walletRotationStrategy,
          this.currentWalletIndex
        );
        
        // Store the current wallet index
        this.currentWalletIndex = walletIndex;
        triedWalletIndices.add(walletIndex);
        
        // Get the wallet keypair
        const wallet = this.walletKeypairs[walletIndex];
        
        // Check if wallet has sufficient balance for a trade
        const walletData = this.wallets[walletIndex];
        if (!walletData.balance || walletData.balance < this.minTradeAmount) {
          // Try to rebalance the wallet by selling some tokens
          const rebalanced = await this.rebalanceWallet(wallet);
          
          if (rebalanced) {
            this.logger.info(`Wallet ${wallet.publicKey.toString().slice(0, 8)}... was successfully rebalanced. Proceeding with trade.`);
          } else {
            this.logger.warn(`Wallet ${wallet.publicKey.toString().slice(0, 8)}... has insufficient balance and could not be rebalanced.`);
            // Try next wallet
            this.currentWalletIndex = (this.currentWalletIndex + 1) % this.walletKeypairs.length;
            continue;
          }
        }
        
        // Generate a randomized trade size
        const tradeAmount = getRandomizedTradeSize(this.minTradeAmount, this.maxTradeAmount);
        
        // Execute the trade
        success = await this.executeTrade(wallet, tradeAmount);
        
        // If the trade fails and we haven't tried all wallets, try another one
        if (!success && triedWalletIndices.size < this.walletKeypairs.length) {
          this.logger.warn('Trade failed, trying with another wallet');
          
          // Choose a different wallet by incrementing the index
          this.currentWalletIndex = (this.currentWalletIndex + 1) % this.walletKeypairs.length;
        }
      }
      
      // If we've tried all wallets and none worked, log this but don't stop the bot yet
      // It will return false which the runCycle can handle appropriately
      if (!success) {
        this.logger.warn('Failed to execute trade with any wallet. Consider adding funds to wallets.');
      }
      
      return success;
    } catch (error: any) {
      this.logger.error(`Error processing wallet: ${error.message}`);
      return false;
    }
  }

  private async runCycle(): Promise<void> {
    try {
      this.logger.info(`Starting trading cycle ${this.currentCycle}/${this.numberOfCycles}`);
      
      // Update market metrics before trading
      await this.updateMarketMetrics();
      
      // Track consecutive failures
      let consecutiveFailures = 0;
      const maxConsecutiveFailures = 3; // Stop after 3 consecutive failures
      
      // Execute trades
      for (let i = 0; i < this.numberOfBuys; i++) {
        if (!this.isRunning) break;
        
        // Process a wallet to execute a trade
        const tradeSuccess = await this.processWallet();
        
        // If processing failed, increment failure counter
        if (!tradeSuccess) {
          consecutiveFailures++;
          this.logger.warn(`Trade attempt ${i+1} failed. Consecutive failures: ${consecutiveFailures}/${maxConsecutiveFailures}`);
          
          // If we've reached the max consecutive failures, stop the bot
          if (consecutiveFailures >= maxConsecutiveFailures) {
            this.logger.error(`Max consecutive failures (${maxConsecutiveFailures}) reached due to insufficient wallet balances. Stopping bot.`);
            this.isRunning = false;
            break;
          }
          
          // Otherwise, try to update wallet balances before next attempt
          await this.updateWalletBalances();
        } else {
          // Reset consecutive failures on success
          consecutiveFailures = 0;
        }
        
        // Use randomized delay between trades
        if (i < this.numberOfBuys - 1 && this.isRunning) {
          const delay = getRandomizedTradeDelay(this.minDelaySeconds, this.maxDelaySeconds);
          this.logger.info(`Waiting ${Math.round(delay / 1000)} seconds until next trade...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      // If the bot is no longer running, return early
      if (!this.isRunning) {
        return;
      }
      
      this.logger.info(`Completed trading cycle ${this.currentCycle}/${this.numberOfCycles}`);
      
      // Move to next cycle if applicable
      if (this.currentCycle < this.numberOfCycles) {
        this.currentCycle++;
        
        // Wait before starting the next cycle
        const cycleDelay = getRandomizedTradeDelay(60, 180); // 1-3 minutes between cycles
        this.logger.info(`Waiting ${Math.round(cycleDelay / 1000)} seconds until next cycle...`);
        await new Promise(resolve => setTimeout(resolve, cycleDelay));
        
        if (this.isRunning) {
          this.runCycle();
        }
      } else {
        this.logger.info('All trading cycles completed');
        this.isRunning = false;
      }
    } catch (error: any) {
      this.logger.error(`Error in trading cycle: ${error.message}`);
      this.isRunning = false;
    }
  }

  /**
   * Checks if wallets have sufficient balance and provides feedback
   */
  private async checkWalletBalances(): Promise<boolean> {
    try {
      // Update wallet balances
      await this.updateWalletBalances();
      
      // Check if any wallet has sufficient balance for trading
      const sufficientBalanceWallets = this.wallets.filter(wallet => 
        wallet.balance && wallet.balance >= this.minTradeAmount
      );
      
      if (sufficientBalanceWallets.length === 0) {
        console.log('\n=========================================');
        console.log('⚠️  WARNING: INSUFFICIENT WALLET BALANCE  ⚠️');
        console.log('=========================================');
        console.log('None of your wallets have sufficient SOL balance to trade.');
        console.log(`Minimum required: ${this.minTradeAmount} SOL per wallet`);
        console.log('\nPlease fund at least one wallet with SOL, then:');
        console.log('1. Use the "Distribute SOL" command to spread funds to multiple wallets');
        console.log('2. Restart the bot after funding your wallets');
        console.log('=========================================\n');
        return false;
      }
      
      if (sufficientBalanceWallets.length < 3) {
        console.log('\n=========================================');
        console.log('⚠️  WARNING: LOW WALLET BALANCES  ⚠️');
        console.log('=========================================');
        console.log(`Only ${sufficientBalanceWallets.length} of ${this.wallets.length} wallets have sufficient balance.`);
        console.log('For better bot detection avoidance, we recommend at least 3 funded wallets.');
        console.log('\nConsider using the "Distribute SOL" command to spread funds more evenly.');
        console.log('=========================================\n');
        
        // Show the wallets with their balances
        console.log('Current wallet balances:');
        this.wallets.forEach((wallet, index) => {
          const hasEnough = wallet.balance && wallet.balance >= this.minTradeAmount;
          console.log(`Wallet ${index + 1}: ${wallet.publicKey.slice(0, 8)}... - ${wallet.balance?.toFixed(4) || 0} SOL ${hasEnough ? '✅' : '❌'}`);
        });
        console.log();
        
        // We still return true as we can continue with the available wallets
        return true;
      }
      
      // Everything looks good
      return true;
    } catch (error: any) {
      this.logger.warn(`Failed to check wallet balances: ${error.message}`);
      return true; // Continue anyway to not block operation
    }
  }

  public async start(): Promise<void> {
    try {
      if (this.isRunning) {
        this.logger.warn('Trading bot is already running');
        return;
      }
      
      this.isRunning = true;
      this.logger.info('Starting trading bot');
      
      // Load wallet data
      await this.loadWallets();
      
      // Check if wallets have sufficient balance
      const hasValidBalances = await this.checkWalletBalances();
      if (!hasValidBalances) {
        this.logger.error('Trading bot stopped due to insufficient wallet balances');
        this.isRunning = false;
        return;
      }
      
      // Initialize AI strategy if enabled
      if (this.useAiOptimization) {
        await this.initializeAIStrategy();
      }
      
      // Initial market metrics update
      await this.updateMarketMetrics();
      
      // Log configuration
      this.logger.info(`Trading ${this.tokenAddress}`);
      this.logger.info(`Trade amount range: ${this.minTradeAmount}-${this.maxTradeAmount} SOL`);
      this.logger.info(`Delay range: ${this.minDelaySeconds}-${this.maxDelaySeconds} seconds`);
      this.logger.info(`Using ${this.wallets.length > 5 ? '3-5' : this.wallets.length} wallets for trading`);
      this.logger.info(`Wallet rotation strategy: ${this.walletRotationStrategy}`);
      this.logger.info(`Adaptive trading: ${this.adaptiveTrading ? 'enabled' : 'disabled'}`);
      this.logger.info(`AI optimization: ${this.useAiOptimization ? 'enabled' : 'disabled'}`);
      
      // Start trading cycle
      await this.runCycle();
    } catch (error: any) {
      this.logger.error(`Failed to start trading bot: ${error.message}`);
      this.isRunning = false;
    }
  }

  public stop(): void {
    this.logger.info('Stopping trading bot');
    this.isRunning = false;
  }

  public static async run(): Promise<void> {
    try {
      console.log('Starting TradingBot in run method');
      const bot = new TradingBot();
      console.log('TradingBot instance created successfully');
      await bot.start();
      console.log('TradingBot start method completed');

      // Add signal handlers to gracefully shut down
      process.on('SIGINT', () => {
        console.log('Received SIGINT signal');
        bot.stop();
        process.exit(0);
      });
      
      process.on('SIGTERM', () => {
        console.log('Received SIGTERM signal');
        bot.stop();
        process.exit(0);
      });
      
      // Log that setup is complete
      console.log('TradingBot is now running');
    } catch (error: any) {
      console.error('CRITICAL ERROR in TradingBot.run():', error.message);
      console.error('Stack trace:', error.stack);
      
      // Log to file as well if logger exists
      try {
        const logger = {
          error: (message: string) => console.error(message)
        };
        logger.error(`CRITICAL BOT ERROR: ${error.message}`);
        logger.error(`Stack trace: ${error.stack}`);
      } catch (logError) {
        // Ignore logger errors
      }
    }
  }
}

export { TradingBot };