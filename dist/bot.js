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
exports.TradingBot = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));
const web3_js_1 = require("@solana/web3.js");
const ora_1 = __importDefault(require("ora"));
const os = __importStar(require("os"));
const bs58_1 = require("bs58");
const aiTradingStrategy_1 = require("./utils/aiTradingStrategy");
const proxyManager_1 = require("./utils/proxyManager");
const axios_1 = __importDefault(require("axios"));
const botDetectionAvoidance_1 = require("./utils/botDetectionAvoidance");
// Load environment variables
dotenv.config();
class TradingBot {
    constructor() {
        this.wallets = [];
        this.walletKeypairs = [];
        this.currentCycle = 1;
        this.aiStrategy = null;
        this.lastParameterUpdate = 0;
        this.parameterUpdateInterval = 5 * 60 * 1000; // 5 minutes
        this.isRunning = false;
        this.walletsToProxies = new Map(); // Map wallet public keys to session IDs
        this.currentWalletIndex = 0;
        this.marketMetrics = {};
        this.metricUpdateInterval = 10 * 60 * 1000; // 10 minutes
        this.lastMetricUpdate = 0;
        this.orderPattern = [];
        this.currentOrderIndex = 0;
        this.walletRotationStrategy = 'random';
        this.minDelaySeconds = 40; // Default minimum delay in seconds
        this.maxDelaySeconds = 120; // Default maximum delay in seconds
        this.adaptiveTrading = true; // Enable adaptive trading by default
        // Initialize logger
        this.logger = {
            info: (message) => console.log(message),
            warn: (message) => console.warn(message),
            error: (message) => console.error(message),
            debug: (message) => console.debug(message)
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
        this.walletRotationStrategy = process.env.WALLET_ROTATION_STRATEGY || 'random';
        this.adaptiveTrading = process.env.ADAPTIVE_TRADING !== 'false';
        // Initialize proxy manager
        this.proxyManager = (0, proxyManager_1.getProxyManager)();
        // Check if proxies are configured but not explicitly enabled via env variable
        if (this.proxyManager.isEnabled() && process.env.USE_PROXIES === undefined) {
            this.useProxies = true; // Enable proxies if they're configured
        }
        // Initialize RPC connection
        this.rpcEndpoint = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
        this.connection = new web3_js_1.Connection(this.rpcEndpoint, 'confirmed');
        // Validate configuration
        this.validateConfiguration();
        // Generate initial order pattern for 20 orders
        this.orderPattern = (0, botDetectionAvoidance_1.generateBalancedOrderPattern)(20);
    }
    validateConfiguration() {
        // Validate token address
        if (!this.tokenAddress) {
            throw new Error('Contract address is required. Please set CONTRACT_ADDRESS in your .env file.');
        }
        try {
            new web3_js_1.PublicKey(this.tokenAddress);
        }
        catch (error) {
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
    async loadWallets() {
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
                const secretKey = (0, bs58_1.decode)(wallet.secretKey);
                return web3_js_1.Keypair.fromSecretKey(secretKey);
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
        }
        catch (error) {
            this.logger.error(`Failed to load wallets: ${error.message}`);
            throw error;
        }
    }
    /**
     * Update the SOL balance for each wallet
     */
    async updateWalletBalances() {
        try {
            for (let i = 0; i < this.walletKeypairs.length; i++) {
                const wallet = this.walletKeypairs[i];
                const balance = await this.connection.getBalance(wallet.publicKey);
                this.wallets[i].balance = balance / 1e9; // Convert lamports to SOL
            }
            this.logger.info('Updated wallet balances');
        }
        catch (error) {
            this.logger.warn(`Failed to update wallet balances: ${error.message}`);
        }
    }
    /**
     * Assign unique proxy session IDs to each wallet
     * This helps maintain consistent IPs per wallet
     */
    assignProxySessions() {
        this.walletsToProxies.clear();
        for (const wallet of this.walletKeypairs) {
            const publicKey = wallet.publicKey.toString();
            // Use consistent session ID for each wallet
            const sessionId = (0, botDetectionAvoidance_1.generateConsistentSessionId)(publicKey);
            this.walletsToProxies.set(publicKey, sessionId);
        }
        this.logger.info(`Assigned proxy sessions to ${this.walletsToProxies.size} wallets`);
    }
    /**
     * Get a proxy configuration for a specific wallet
     */
    getProxyConfigForWallet(wallet) {
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
        }
        else {
            // Otherwise just rotate to get a fresh IP
            this.proxyManager.rotateProxy();
            return this.proxyManager.getAxiosConfig(randomCountry);
        }
    }
    resolveWalletPath() {
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
    async initializeAIStrategy() {
        if (!this.useAiOptimization)
            return;
        try {
            const spinner = (0, ora_1.default)('Initializing AI trading strategy...').start();
            this.aiStrategy = await (0, aiTradingStrategy_1.createAITradingStrategy)(this.tokenAddress, this.connection, this.maxTradeAmount, this.minTradeAmount, this.timeBetweenBuys, this.numberOfBuys, true // useAI
            );
            spinner.succeed('AI trading strategy initialized successfully');
            // Do an initial update to get recommendations
            await this.updateTradingParameters();
        }
        catch (error) {
            this.logger.error(`Failed to initialize AI strategy: ${error.message}`);
            this.useAiOptimization = false;
            this.logger.warn('AI optimization disabled due to initialization failure');
        }
    }
    async updateTradingParameters() {
        if (!this.useAiOptimization || !this.aiStrategy)
            return;
        const now = Date.now();
        if (now - this.lastParameterUpdate < this.parameterUpdateInterval)
            return;
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
        }
        catch (error) {
            this.logger.error(`Failed to update trading parameters: ${error.message}`);
        }
    }
    /**
     * Update market metrics for adaptive trading
     */
    async updateMarketMetrics() {
        const now = Date.now();
        if (!this.adaptiveTrading || now - this.lastMetricUpdate < this.metricUpdateInterval)
            return;
        try {
            // If using AI strategy, update it first to keep its internal state fresh
            if (this.aiStrategy) {
                await this.aiStrategy.update();
            }
            // Always fetch market metrics directly from the API
            try {
                const dexScreenerUrl = `https://api.dexscreener.com/latest/dex/tokens/${this.tokenAddress}`;
                const response = await axios_1.default.get(dexScreenerUrl, { timeout: 10000 });
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
                }
                else {
                    this.logger.warn('No trading pairs found for this token in DexScreener API');
                }
            }
            catch (error) {
                this.logger.warn(`Failed to fetch market metrics: ${error.message}`);
            }
            this.lastMetricUpdate = now;
            // Adjust trading parameters based on market conditions
            if (this.adaptiveTrading && this.marketMetrics.liquidity !== undefined) {
                const adaptedParams = (0, botDetectionAvoidance_1.adaptToMarketConditions)({
                    minTradeAmount: this.minTradeAmount,
                    maxTradeAmount: this.maxTradeAmount,
                    minTradeDelay: this.minDelaySeconds,
                    maxTradeDelay: this.maxDelaySeconds
                }, this.marketMetrics);
                // Update trading parameters based on market conditions
                this.minTradeAmount = adaptedParams.minTradeAmount;
                this.maxTradeAmount = adaptedParams.maxTradeAmount;
                this.minDelaySeconds = adaptedParams.minTradeDelay;
                this.maxDelaySeconds = adaptedParams.maxTradeDelay;
                this.logger.info('Trading parameters adjusted based on market conditions:');
                this.logger.info(`Trade size: ${this.minTradeAmount.toFixed(4)}-${this.maxTradeAmount.toFixed(4)} SOL`);
                this.logger.info(`Delay range: ${this.minDelaySeconds}-${this.maxDelaySeconds} seconds`);
            }
        }
        catch (error) {
            this.logger.error(`Error updating market metrics: ${error.message}`);
        }
    }
    async executeTrade(wallet, amount) {
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
                this.orderPattern = (0, botDetectionAvoidance_1.generateBalancedOrderPattern)(20);
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
            }
            else {
                // Simulate balance increase after sell
                walletData.balance += amount * 0.98; // Accounting for some fees
            }
            this.logger.info(`${orderType.toUpperCase()} completed successfully`);
            return true;
        }
        catch (error) {
            this.logger.error(`Trade execution error: ${error.message}`);
            return false;
        }
    }
    async processWallet() {
        try {
            // Choose a wallet based on the selected strategy
            const walletIndex = (0, botDetectionAvoidance_1.selectWalletForTrade)(this.wallets, this.walletRotationStrategy, this.currentWalletIndex);
            // Store the current wallet index
            this.currentWalletIndex = walletIndex;
            // Get the wallet keypair
            const wallet = this.walletKeypairs[walletIndex];
            // Generate a randomized trade size
            const tradeAmount = (0, botDetectionAvoidance_1.getRandomizedTradeSize)(this.minTradeAmount, this.maxTradeAmount);
            // Execute the trade
            const success = await this.executeTrade(wallet, tradeAmount);
            // If the trade fails, try with another wallet
            if (!success && this.walletKeypairs.length > 1) {
                this.logger.warn('Trade failed, trying with another wallet');
                // Choose a different wallet
                const newWalletIndex = (walletIndex + 1) % this.walletKeypairs.length;
                this.currentWalletIndex = newWalletIndex;
                return await this.executeTrade(this.walletKeypairs[newWalletIndex], tradeAmount);
            }
            return success;
        }
        catch (error) {
            this.logger.error(`Error processing wallet: ${error.message}`);
            return false;
        }
    }
    async runCycle() {
        try {
            this.logger.info(`Starting trading cycle ${this.currentCycle}/${this.numberOfCycles}`);
            // Update market metrics before trading
            await this.updateMarketMetrics();
            // Execute trades
            for (let i = 0; i < this.numberOfBuys; i++) {
                if (!this.isRunning)
                    break;
                // Process a wallet to execute a trade
                await this.processWallet();
                // Use randomized delay between trades
                if (i < this.numberOfBuys - 1) {
                    const delay = (0, botDetectionAvoidance_1.getRandomizedTradeDelay)(this.minDelaySeconds, this.maxDelaySeconds);
                    this.logger.info(`Waiting ${Math.round(delay / 1000)} seconds until next trade...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
            this.logger.info(`Completed trading cycle ${this.currentCycle}/${this.numberOfCycles}`);
            // Move to next cycle if applicable
            if (this.currentCycle < this.numberOfCycles) {
                this.currentCycle++;
                // Wait before starting the next cycle
                const cycleDelay = (0, botDetectionAvoidance_1.getRandomizedTradeDelay)(60, 180); // 1-3 minutes between cycles
                this.logger.info(`Waiting ${Math.round(cycleDelay / 1000)} seconds until next cycle...`);
                await new Promise(resolve => setTimeout(resolve, cycleDelay));
                if (this.isRunning) {
                    this.runCycle();
                }
            }
            else {
                this.logger.info('All trading cycles completed');
                this.isRunning = false;
            }
        }
        catch (error) {
            this.logger.error(`Error in trading cycle: ${error.message}`);
            this.isRunning = false;
        }
    }
    /**
     * Checks if wallets have sufficient balance and provides feedback
     */
    async checkWalletBalances() {
        try {
            // Update wallet balances
            await this.updateWalletBalances();
            // Check if any wallet has sufficient balance for trading
            const sufficientBalanceWallets = this.wallets.filter(wallet => wallet.balance && wallet.balance >= this.minTradeAmount);
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
        }
        catch (error) {
            this.logger.warn(`Failed to check wallet balances: ${error.message}`);
            return true; // Continue anyway to not block operation
        }
    }
    async start() {
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
        }
        catch (error) {
            this.logger.error(`Failed to start trading bot: ${error.message}`);
            this.isRunning = false;
        }
    }
    stop() {
        this.logger.info('Stopping trading bot');
        this.isRunning = false;
    }
    static async run() {
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
        }
        catch (error) {
            console.error('CRITICAL ERROR in TradingBot.run():', error.message);
            console.error('Stack trace:', error.stack);
            // Log to file as well if logger exists
            try {
                const logger = {
                    error: (message) => console.error(message)
                };
                logger.error(`CRITICAL BOT ERROR: ${error.message}`);
                logger.error(`Stack trace: ${error.stack}`);
            }
            catch (logError) {
                // Ignore logger errors
            }
        }
    }
}
exports.TradingBot = TradingBot;
