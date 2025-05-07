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

// Load environment variables
dotenv.config();

interface WalletData {
  publicKey: string;
  secretKey: string;
  apiKey?: string;
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
    this.maxTradeAmount = parseFloat(process.env.MAX_TRADE_AMOUNT || '0.005');
    this.minTradeAmount = parseFloat(process.env.MIN_TRADE_AMOUNT || '0.0005');
    this.timeBetweenBuys = parseInt(process.env.TIME_BETWEEN_BUYS || '5000');
    this.numberOfBuys = parseInt(process.env.NUMBER_OF_BUYS || '3');
    this.numberOfCycles = parseInt(process.env.NUMBER_OF_CYCLES || '1');
    this.isJitoMode = process.env.JITO === 'true';
    this.useAiOptimization = process.env.USE_AI_OPTIMIZATION === 'true';
    this.useProxies = process.env.USE_PROXIES === 'true';

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
      
      this.logger.info(`Successfully loaded ${this.wallets.length} wallets`);
    } catch (error: any) {
      this.logger.error(`Failed to load wallets: ${error.message}`);
      throw error;
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
      // Create a session ID based on a portion of the wallet's public key
      // This ensures the same wallet always gets the same session ID
      const sessionId = `s-${publicKey.substring(0, 8)}`;
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
      this.maxTradeAmount = updatedParams.maxAmount;
      this.minTradeAmount = updatedParams.minAmount;
      this.timeBetweenBuys = updatedParams.timeBetween;
      this.numberOfBuys = updatedParams.numBuys;
      
      this.lastParameterUpdate = now;
      
      // Log the updated parameters
      this.logger.info(chalk.cyan('Trading parameters updated by AI:'));
      this.logger.info(chalk.green(`Max Trade Amount: ${this.maxTradeAmount} SOL`));
      this.logger.info(chalk.green(`Min Trade Amount: ${this.minTradeAmount} SOL`));
      this.logger.info(chalk.green(`Time Between Buys: ${this.timeBetweenBuys}ms`));
      this.logger.info(chalk.green(`Number of Buys: ${this.numberOfBuys}`));
    } catch (error: any) {
      this.logger.error(`Error updating trading parameters: ${error.message}`);
    }
  }

  private async executeTrade(wallet: Keypair, amount: number): Promise<boolean> {
    try {
      const publicKey = wallet.publicKey.toString();
      this.logger.info(`Executing trade of ${amount} SOL using wallet ${publicKey}`);
      
      // Get proxy configuration for this wallet if proxies are enabled
      let proxyConfig = {};
      if (this.useProxies && this.proxyManager.isEnabled()) {
        // Test and ensure we have a fresh IP for trading
        const identifier = `trade-${publicKey}`;
        await this.proxyManager.ensureFreshIp(identifier);
        
        // Get the proxy configuration for this wallet
        proxyConfig = this.getProxyConfigForWallet(wallet);
        
        // Log the proxy being used
        const proxyTest = await this.proxyManager.testProxy();
        if (proxyTest.success && proxyTest.ip) {
          this.logger.info(`Trading through proxy IP: ${proxyTest.ip}`);
        }
      }
      
      // Simulate trade execution - in a real implementation, this would
      // interact with a DEX using the proxy configuration
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      this.logger.info(chalk.green(`Trade executed successfully`));
      return true;
    } catch (error: any) {
      this.logger.error(`Trade execution failed: ${error.message}`);
      return false;
    }
  }

  private async processWallet(wallet: Keypair): Promise<boolean> {
    try {
      // Calculate random trade amount between min and max
      const tradeAmount = this.minTradeAmount + 
        Math.random() * (this.maxTradeAmount - this.minTradeAmount);
      
      // Execute trade
      const success = await this.executeTrade(wallet, tradeAmount);
      
      if (success) {
        // Wait between trades
        await new Promise(resolve => setTimeout(resolve, this.timeBetweenBuys));
      } else {
        // Wait longer if trade failed
        await new Promise(resolve => setTimeout(resolve, this.timeBetweenBuys * 2));
      }
      
      return success;
    } catch (error: any) {
      this.logger.error(`Error processing wallet ${wallet.publicKey.toString()}: ${error.message}`);
      return false;
    }
  }

  private async runCycle(): Promise<void> {
    this.logger.info(chalk.cyan(`Starting cycle ${this.currentCycle} of ${this.numberOfCycles}`));
    
    // Process each wallet
    for (const wallet of this.walletKeypairs) {
      // Update trading parameters if AI optimization is enabled
      await this.updateTradingParameters();
      
      // Execute multiple buys per wallet
      for (let i = 0; i < this.numberOfBuys; i++) {
        if (!this.isRunning) return; // Check if bot was stopped
        
        this.logger.info(`Processing wallet ${wallet.publicKey.toString()} - Buy ${i + 1}/${this.numberOfBuys}`);
        await this.processWallet(wallet);
      }
    }
    
    this.logger.info(chalk.green(`Completed cycle ${this.currentCycle}`));
    this.currentCycle++;
  }

  public async start(): Promise<void> {
    try {
      this.isRunning = true;
      
      // Display bot configuration
      this.logger.info(chalk.cyan('\n====== BOT STARTING ======'));
      this.logger.info(chalk.green(`Contract Address: ${this.tokenAddress}`));
      this.logger.info(chalk.green(`Max Trade Amount: ${this.maxTradeAmount} SOL`));
      this.logger.info(chalk.green(`Min Trade Amount: ${this.minTradeAmount} SOL`));
      this.logger.info(chalk.green(`Time Between Buys: ${this.timeBetweenBuys}ms`));
      this.logger.info(chalk.green(`Number of Buys: ${this.numberOfBuys}`));
      this.logger.info(chalk.green(`Number of Cycles: ${this.numberOfCycles}`));
      this.logger.info(chalk.green(`Mode: ${this.isJitoMode ? 'JITO' : 'Lightning/Bump'}`));
      this.logger.info(chalk.green(`AI Optimization: ${this.useAiOptimization ? 'Enabled' : 'Disabled'}`));
      this.logger.info(chalk.green(`Proxy Support: ${this.useProxies ? 'Enabled' : 'Disabled'}`));
      this.logger.info(chalk.cyan('==========================\n'));
      
      // Test proxy connection if enabled
      if (this.useProxies && this.proxyManager.isEnabled()) {
        const proxyTest = await this.proxyManager.testProxy();
        if (proxyTest.success) {
          this.logger.info(chalk.green(`Proxy connection successful: ${proxyTest.ip}`));
        } else {
          this.logger.warn(chalk.yellow(`Proxy test failed: ${proxyTest.message}`));
          this.logger.warn(chalk.yellow('Continuing without proxies'));
          this.useProxies = false;
        }
      }
      
      // Load wallets
      await this.loadWallets();
      
      // Initialize AI strategy if enabled
      if (this.useAiOptimization) {
        await this.initializeAIStrategy();
      }
      
      // Run cycles
      while (this.currentCycle <= this.numberOfCycles && this.isRunning) {
        await this.runCycle();
      }
      
      this.logger.info(chalk.green('Bot execution completed successfully'));
    } catch (error: any) {
      this.logger.error(`Bot execution failed: ${error.message}`);
    } finally {
      this.isRunning = false;
    }
  }

  public stop(): void {
    this.logger.info(chalk.yellow('Stopping bot...'));
    this.isRunning = false;
  }

  public static async run(): Promise<void> {
    const bot = new TradingBot();
    await bot.start();
    
    // Handle process termination
    process.on('SIGINT', () => {
      bot.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      bot.stop();
      process.exit(0);
    });
  }
}

// Run the bot if this file is executed directly
if (require.main === module) {
  TradingBot.run().catch(error => {
    console.error('Bot execution failed:', error);
    process.exit(1);
  });
}

export default TradingBot; 