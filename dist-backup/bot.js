"use strict";
require('module-alias/register');
const dotenv = require('dotenv');
const DiscordService = require('./core/services/discord');
const TelegramService = require('./core/services/telegram');
const fs = require('fs');
const path = require('path');
const base58 = require('bs58');
const os = require('os');
const { sleep } = require('@utils/sleep');
const { setupSolanaConnection } = require('./api/solana');
const { PublicKey, Keypair, VersionedTransaction, Transaction, SystemProgram, sendAndConfirmTransaction } = require('@solana/web3.js');
const { TRADE_TYPE, THREADS, STREAM, SOL_MINT_ADDRESS, USDC_MINT_ADDRESS, TOKEN_MINT_ADDRESS } = require("@constants/constants");
const { Worker, isMainThread, workerData } = require('worker_threads');
const { createClient } = require('redis');
const fsSync = require('fs');
const logger = require('@utils/logger'); // Import the logger
// Initialize services
// Make this part safer by using variables
let discord = null;
let telegram = null;
const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL;
class Config {
    static get() {
        return {
            retryAttempts: 5,
            retryDelay: 1000,
            workerInterval: 1000,
            healthCheckInterval: 60000,
            connectionTimeout: 300000, // 5 minutes
            batchProcessingInterval: 1000
        };
    }
}
class Bot {
    constructor() {
        dotenv.config();
        this.logger = {
            info: (message) => console.log(message),
            warn: (message) => console.warn(message),
            error: (message) => console.error(message),
            debug: (message) => console.debug(message)
        };
        // Add cycles tracking
        this.currentCycle = 1;
        this.maxCycles = parseInt(process.env.NUMBER_OF_CYCLES || '1');
        this.logger.info(`Bot will run for ${this.maxCycles} cycle(s)`);
        // Ensure we have valid RPC endpoints
        this.rpcEndpoints = [];
        this.logger.info(`Using primary Solana RPC: ${this.rpcEndpoints[0]}`);
        if (this.rpcEndpoints.length > 1) {
            this.logger.info(`Using backup Solana RPC: ${this.rpcEndpoints[1]}`);
        }
        this.validateEnvironment();
        this.walletData = null;
        this.currentEndpointIndex = 0;
        this.numThreads = 1; // Force single thread for sequential processing
        // Add cycles tracking
        this.currentCycle = 1;
        this.maxCycles = parseInt(process.env.NUMBER_OF_CYCLES || '1');
        this.logger.info(`Bot will run for ${this.maxCycles} cycle(s)`);
        // Use a flexible path for wallets that works locally and on the server
        const isLightningMode = process.env.JITO ? process.env.JITO.toLowerCase() === 'false' : false;
        const useRedis = process.env.TRADE_TYPE && process.env.TRADE_TYPE.toLowerCase() !== 'sol_spl';
        // Get project root directory by going up from 'dist'
        const projectRootDir = path.resolve(__dirname, '..');
        // Use the .config directory in the project root (same as createWallets.ts)
        const projectConfigDir = path.join(projectRootDir, '.config');
        const projectWalletPath = path.join(projectConfigDir, 'wallets.json');
        const projectStatePath = path.join(projectConfigDir, 'wallet_state.json');
        // If the project wallet file exists, use it
        if (fs.existsSync(projectWalletPath)) {
            this.walletFilePath = projectWalletPath;
            this.stateFilePath = projectStatePath;
            this.logger.info('Using wallet and state files from project .config directory');
        }
        else {
            // Otherwise fall back to the server path structure
            const homeDir = os.homedir();
            const basePath = useRedis
                ? path.join(homeDir, 'marketMaker', 'instances', process.env.TRADE_TYPE)
                : path.join(homeDir, 'marketMaker', 'instances', 'user', process.env.CHAT_ID);
            // Set wallet file path - always use wallets.json
            this.walletFilePath = path.join(basePath, '.config', 'wallets.json');
            // Add state file path for resuming wallet processing
            this.stateFilePath = path.join(basePath, '.config', 'wallet_state.json');
            // Try to copy from project .config as a last resort if it exists
            if (fs.existsSync(projectWalletPath) && !fs.existsSync(this.walletFilePath)) {
                try {
                    // Ensure directory exists
                    const serverConfigDir = path.dirname(this.walletFilePath);
                    if (!fs.existsSync(serverConfigDir)) {
                        fs.mkdirSync(serverConfigDir, { recursive: true });
                    }
                    // Copy the wallet file
                    fs.copyFileSync(projectWalletPath, this.walletFilePath);
                    this.logger.info(`Copied wallet file from project to server path: ${this.walletFilePath}`);
                }
                catch (err) {
                    this.logger.error(`Failed to copy wallet file: ${err.message}`);
                }
            }
        }
        this.logger.info(`Using wallet file path: ${this.walletFilePath}`);
        this.logger.info(`Using state file path: ${this.stateFilePath}`);
        this.logger.info(`Running in ${isLightningMode ? 'Lightning/Bump' : 'Jito'} mode`);
        // Cache management
        this.connections = new Map();
        this.strategies = new Map();
        this.jupiterClients = new Map();
        // Health monitoring
        this.healthChecks = {
            lastSuccessfulRun: Date.now(),
            errors: new Map(),
            activeConnections: new Set()
        };
        // Sequential processing controls
        this.currentWalletIndex = 0;
        this.walletKeypairs = [];
        this.walletOperationInProgress = false;
        this.processingTimer = null;
        this.strategyInstances = new Map();
        this.isProcessing = false;
        // Add wallet retry tracking to prevent endless retries
        this.walletRetryMap = new Map();
        this.MAX_WALLET_RETRIES = 10; // Maximum number of consecutive retries for the same wallet
        // Add worker management
        this.workers = new Map();
        this.healthCheckInterval = null;
        // Start health monitoring
        // this.monitorHealth();
        this.activeTradeManagers = new Map(); // Track which worker manages which token
        // Add balance tracking only for specific trade types
        this.balanceCheckTypes = new Set(['sol_spl']);
        this.walletBalances = new Map();
        // Remove redundant trade log initialization since neural network handles trade tracking
        this.activeTradeManagers = new Map(); // Keep this for worker coordination only
    }
    async() {
        this.healthCheckInterval = setInterval(async () => {
            try {
                const now = Date.now();
                const timeSinceLastSuccess = now - this.healthChecks.lastSuccessfulRun;
                if (timeSinceLastSuccess > Config.get().connectionTimeout) {
                    console.warn('Health check failed, restarting workers...');
                    // await this.restartWorkers();
                }
                // this.cleanupStaleConnections();
            }
            catch (error) {
                console.error('Error in health monitoring:', error);
            }
        }, Config.get().healthCheckInterval);
    }
    getConnection(endpoint) {
        if (!this.connections.has(endpoint)) {
            const connection = setupSolanaConnection(endpoint);
            this.connections.set(endpoint, {
                connection,
                lastUsed: Date.now()
            });
            this.healthChecks.activeConnections.add(endpoint);
        }
        const connInfo = this.connections.get(endpoint);
        connInfo.lastUsed = Date.now();
        return connInfo.connection;
    }
    validateEnvironment() {
        // We already ensure RPC endpoints in constructor, so just verify we have at least one
        if (this.rpcEndpoints.length === 0) {
            throw new Error('No valid Solana RPC endpoints available. Please configure SOLANA_RPC in your .env file.');
        }
        if (!process.env.ENABLE_TRADING) {
            console.warn('ENABLE_TRADING is not set. Defaulting to false');
        }
        // Get TELEGRAM_CHAT_ID with a fallback value
        this.chatId = process.env.TELEGRAM_CHAT_ID || process.env.CHAT_ID || 'default';
        if (!this.chatId) {
            this.logger.warn('TELEGRAM_CHAT_ID is not set. Using "default" as fallback.');
            this.chatId = 'default';
        }
        // Don't check CONTRACT_ADDRESS - CLI tool already validates this
        // Log current configuration
        this.logger.info(`Trade type: ${process.env.TRADE_TYPE || 'sol_spl'}`);
        this.logger.info(`JITO mode: ${process.env.JITO === 'true' ? 'enabled' : 'disabled'}`);
        this.logger.info(`Chat ID: ${this.chatId}`);
    }
    async loadWalletData() {
        try {
            if (!fsSync.existsSync(this.walletFilePath)) {
                this.logger.error(`Wallet file not found at: ${this.walletFilePath}`);
                throw new Error(`Wallet file not found. Please create a wallet file at: ${this.walletFilePath}`);
            }
            const data = fsSync.readFileSync(this.walletFilePath, 'utf8');
            this.walletData = JSON.parse(data);
            if (!Array.isArray(this.walletData) || this.walletData.length === 0) {
                throw new Error('Invalid wallet data - must be a non-empty array');
            }
            this.logger.info(`Successfully loaded ${this.walletData.length} wallets from ${this.walletFilePath}`);
        }
        catch (error) {
            this.logger.error(`Failed to load wallets from file: ${error.message}`);
            throw error;
        }
    }
    getKeypairsFromWalletData(walletData) {
        const isLightningMode = process.env.JITO ? process.env.JITO.toLowerCase() === 'false' : false;
        return walletData.map(wallet => {
            const secretKey = base58.decode(wallet.secretKey);
            const keypair = Keypair.fromSecretKey(secretKey);
            // For lightning mode, include the API key with the keypair data
            if (isLightningMode && wallet.apiKey) {
                return {
                    publicKey: keypair.publicKey,
                    secretKey: keypair.secretKey,
                    apiKey: wallet.apiKey // Include API key for Lightning/Bump bot mode
                };
            }
            return {
                publicKey: keypair.publicKey,
                secretKey: keypair.secretKey
            };
        });
    }
    getNextConnectionFromPool(connections) {
        const connection = connections[this.currentEndpointIndex];
        this.currentEndpointIndex = (this.currentEndpointIndex + 1) % connections.length;
        return connection;
    }
    async executeStrategy(strategy, tradeType, enabled) {
        switch (tradeType) {
            case 'sol_spl':
                return await strategy.runSolSpl(enabled);
            default:
                throw new Error(`Unsupported trade type: ${tradeType}`);
        }
    }
    async handleRateLimitError(publicKeyString, strategy, enabled) {
        console.warn(`Rate limit exceeded. Implementing exponential backoff...`);
        const maxRetries = Config.get().retryAttempts;
        const baseDelay = Config.get().retryDelay;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const delay = baseDelay * Math.pow(2, attempt - 1);
            console.warn(`Retrying in ${delay / 1000} seconds... (Attempt ${attempt}/${maxRetries})`);
            await sleep(delay);
            try {
                const connection = this.getNextConnectionFromPool(this.rpcEndpoints);
                console.log(`Switched to Network: ${connection.rpcEndpoint}`);
                return await this.executeStrategy(strategy, enabled);
            }
            catch (retryError) {
                console.error(`Retry attempt ${attempt} failed:`, retryError);
                if (attempt === maxRetries) {
                    throw new Error(`Max retries reached for ${publicKeyString}`);
                }
            }
        }
    }
    async processKeypair(keypairData, enabled, tradeType, strategyInstances) {
        const { publicKey, secretKey } = keypairData;
        try {
            // We no longer directly process keypairs - everything goes through the queue system
            // This method is now a no-op to prevent parallel wallet processing
            // Just log that we received a request to process this keypair
            console.log(`Request to process ${publicKey} received - will be handled by queue system`);
            // Do not execute any operations here - the queue system will handle all wallet processing
        }
        catch (error) {
            // Make error handling more specific
            if (error?.message) {
                this.logger.error(`Error in processKeypair for ${publicKey}: ${error.message}`);
            }
            else {
                this.logger.error(`Unknown error in processKeypair for ${publicKey}`);
            }
            this.healthChecks.errors.set(publicKey, {
                timestamp: Date.now(),
                error: error?.message || 'Unknown error'
            });
        }
    }
    // Market making implementation for both JITO and bump bot patterns
    async executeMarketMaking(strategy, currentKeypair, nextWallet, tradeType) {
        try {
            const walletKey = currentKeypair.publicKey.toString();
            // Check if JITO mode is enabled
            if (process.env.JITO === 'true') {
                console.log(`Executing JITO market making with wallet: ${walletKey.substring(0, 8)}...`);
                // Execute the JITO market making through the strategy
                const result = await strategy.executeJitoMarketMaking(currentKeypair, nextWallet);
                return result;
            }
            // Non-JITO mode (bump bot pattern) - multiple buys then sell
            console.log(`Using bump bot strategy with wallet: ${walletKey.substring(0, 8)}...`);
            // If we're in lightning mode, check for API key
            if (currentKeypair.apiKey) {
                console.log(`Using API key (starts with ${currentKeypair.apiKey.substring(0, 8)}...) for this wallet`);
            }
            else {
                console.log(`Warning: No API key found for this wallet in lightning mode`);
            }
            // Configuration from environment variables or use defaults
            const NUMBER_OF_BUYS = parseInt(process.env.NUMBER_OF_BUYS || "3");
            const TIME_BETWEEN_BUYS = parseInt(process.env.TIME_BETWEEN_BUYS || "5000");
            const TIME_BEFORE_SELL = parseInt(process.env.TIME_BEFORE_SELL || "10000");
            const TIME_AFTER_SELL = parseInt(process.env.TIME_AFTER_SELL || "5000");
            // Print TOKEN_MINT_ADDRESS for debugging
            const tokenMintAddress = TOKEN_MINT_ADDRESS;
            console.log(`Debug - TOKEN_MINT_ADDRESS: ${tokenMintAddress || 'not set'}`);
            if (!tokenMintAddress) {
                console.error('TOKEN_MINT_ADDRESS must be set in environment variables');
                return {
                    success: false,
                    error: 'TOKEN_MINT_ADDRESS not configured',
                    tradingSuccess: false
                };
            }
            // Get Solana connection for balance checks
            const connection = this.getConnection(this.rpcEndpoints[0]);
            // Get initial wallet balance before trading
            const initialBalance = await connection.getBalance(currentKeypair.publicKey);
            console.log(`Initial wallet balance: ${initialBalance / 1e9} SOL`);
            // Track signatures of each transaction
            const buySignatures = [];
            let sellSignature = null;
            // Track if we've bought any tokens (even if some buys fail)
            let hasBoughtTokens = false;
            // Execute multiple buys according to pattern
            for (let i = 0; i < NUMBER_OF_BUYS; i++) {
                // Execute a buy operation
                const buyAmount = parseFloat(process.env.MAX_TRADE_AMOUNT) || 0.05;
                console.log(`Executing buy ${i + 1}/${NUMBER_OF_BUYS} with ${buyAmount} SOL`);
                try {
                    // Pass keypair directly to executeBuy, not the jupiterClient
                    const buyResult = await strategy.executeBuy(currentKeypair, buyAmount);
                    if (!buyResult.success) {
                        console.error(`Buy operation ${i + 1} failed: ${buyResult.error}`);
                        // If first buy fails, return complete failure only if we haven't bought any tokens yet
                        if (i === 0) {
                            return {
                                success: false,
                                error: buyResult.error,
                                tradingSuccess: false
                            };
                        }
                        // If subsequent buys fail, continue to next buy or sell what we have
                        console.log(`Continuing despite failed buy ${i + 1}`);
                        continue;
                    }
                    console.log(`Buy ${i + 1} successful with signature: ${buyResult.signature}`);
                    buySignatures.push(buyResult.signature);
                    hasBoughtTokens = true;
                    // Wait between buys (if not the last buy)
                    if (i < NUMBER_OF_BUYS - 1) {
                        console.log(`Waiting ${TIME_BETWEEN_BUYS / 1000} seconds before next buy...`);
                        await new Promise(resolve => setTimeout(resolve, TIME_BETWEEN_BUYS));
                    }
                }
                catch (error) {
                    console.error(`Buy operation ${i + 1} threw exception: ${error.message}`);
                    // If first buy fails with exception, return failure
                    if (i === 0 && !hasBoughtTokens) {
                        return {
                            success: false,
                            error: error.message,
                            tradingSuccess: false
                        };
                    }
                    // If we've already made successful buys, continue to sell phase
                    if (hasBoughtTokens) {
                        console.log(`Some buys succeeded, continuing to sell phase...`);
                        break;
                    }
                }
            }
            // Only proceed to sell if we've made at least one successful buy
            if (!hasBoughtTokens && buySignatures.length === 0) {
                console.error('No successful buys were made, skipping sell operation');
                return {
                    success: false,
                    error: 'No successful buys were made',
                    tradingSuccess: false
                };
            }
            // Wait before selling
            console.log(`Waiting ${TIME_BEFORE_SELL / 1000} seconds before selling...`);
            await new Promise(resolve => setTimeout(resolve, TIME_BEFORE_SELL));
            // Execute sell operation
            console.log(`Executing sell operation for all tokens...`);
            try {
                // Pass keypair directly to executeSell, not the jupiterClient
                const sellResult = await strategy.executeSell(currentKeypair);
                if (!sellResult.success) {
                    console.error(`Sell operation failed: ${sellResult.error}`);
                    return {
                        success: true,
                        buySignatures,
                        tradingSuccess: true,
                        sellSuccess: false,
                        sellError: sellResult.error
                    };
                }
                console.log(`Sell successful with signature: ${sellResult.signature}`);
                sellSignature = sellResult.signature;
            }
            catch (error) {
                console.error(`Sell operation threw exception: ${error.message}`);
                return {
                    success: true,
                    buySignatures,
                    tradingSuccess: true,
                    sellSuccess: false,
                    sellError: error.message
                };
            }
            // Wait after sell
            console.log(`Waiting ${TIME_AFTER_SELL / 1000} seconds after sell...`);
            await new Promise(resolve => setTimeout(resolve, TIME_AFTER_SELL));
            // Check final balance
            const finalBalance = await connection.getBalance(currentKeypair.publicKey);
            console.log(`Final wallet balance after sell: ${finalBalance / 1e9} SOL`);
            const profit = finalBalance - initialBalance;
            console.log(`Trade cycle profit: ${profit / 1e9} SOL`);
            // Wallet rebalancing - transfer funds to next wallet
            let transferSuccess = false;
            let transferSignature = null;
            if (nextWallet && nextWallet.publicKey) {
                try {
                    const nextWalletKey = nextWallet.publicKey.toString();
                    console.log(`Rebalancing wallets: Transferring to next wallet ${nextWalletKey.substring(0, 8)}...`);
                    // Keep some SOL for fees
                    const RESERVE_FOR_FEES = 0.001 * 1e9; // 0.001 SOL for fees
                    // Determine transfer amount - if profitable transfer more
                    let transferAmount;
                    if (profit > 0) {
                        // If profitable, transfer initial amount plus 75% of profits
                        const profitShare = profit * 0.75;
                        transferAmount = finalBalance - RESERVE_FOR_FEES - (profit - profitShare);
                        console.log(`Profitable trade! Transferring initial amount plus ${profitShare / 1e9} SOL (75% of profits)`);
                    }
                    else {
                        // Not profitable, just transfer most of the remaining balance
                        transferAmount = finalBalance - RESERVE_FOR_FEES;
                        console.log(`Not profitable. Transferring remaining balance minus fees`);
                    }
                    // Make sure transfer amount is positive
                    if (transferAmount > 0) {
                        console.log(`Transfer amount: ${transferAmount / 1e9} SOL`);
                        // Create transfer transaction
                        const transaction = new Transaction().add(SystemProgram.transfer({
                            fromPubkey: currentKeypair.publicKey,
                            toPubkey: nextWallet.publicKey,
                            lamports: Math.floor(transferAmount)
                        }));
                        // Sign and send transaction
                        transferSignature = await sendAndConfirmTransaction(connection, transaction, [currentKeypair]);
                        console.log(`Transfer successful with signature: ${transferSignature}`);
                        transferSuccess = true;
                        // Verify next wallet received the funds
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        const nextWalletBalance = await connection.getBalance(nextWallet.publicKey);
                        console.log(`Next wallet balance after transfer: ${nextWalletBalance / 1e9} SOL`);
                    }
                    else {
                        console.log(`Transfer amount too small, skipping transfer`);
                    }
                }
                catch (transferError) {
                    console.error(`Error transferring to next wallet: ${transferError.message}`);
                    transferSuccess = false;
                }
            }
            else {
                console.log(`No next wallet provided, skipping rebalancing`);
            }
            return {
                success: true,
                buySignatures,
                sellSignature,
                tradingSuccess: true,
                profit: profit / 1e9,
                isProfitable: profit > 0,
                transferSuccess,
                transferSignature
            };
        }
        catch (error) {
            console.error(`Market making error:`, error);
            return { success: false, error: error.message };
        }
    }
    loadStrategy(tradeType) {
        // Dynamically import the required strategy
        let Strategy;
        try {
            switch (tradeType.toLowerCase()) {
                case 'sol_spl':
                    Strategy = require('./strategies/sol_spl');
                    break;
                default:
                    throw new Error(`Invalid trade type: ${tradeType}`);
            }
        }
        catch (error) {
            console.error(`Error loading strategy for trade type ${tradeType}:`, error);
            process.exit(1);
        }
        return Strategy;
    }
    isValidBase58(str) {
        try {
            // Add additional validation
            if (!str || typeof str !== 'string')
                return false;
            const decoded = base58.decode(str);
            return decoded.length === 32; // Solana public keys are 32 bytes
        }
        catch (e) {
            return false;
        }
    }
    async main() {
        try {
            // For market-making mode (sol_spl), continue with the original wallet-based approach
            // Load wallet data
            await this.loadWalletData();
            this.walletKeypairs = this.getKeypairsFromWalletData(this.walletData);
            console.log(`Loaded ${this.walletKeypairs.length} wallets for sequential processing`);
            // Read current index from state file
            let currentIndex = 0;
            if (fs.existsSync(this.stateFilePath)) {
                const stateData = JSON.parse(fs.readFileSync(this.stateFilePath, 'utf8'));
                if (stateData && typeof stateData.currentWalletIndex === 'number') {
                    currentIndex = stateData.currentWalletIndex;
                    console.log(`Read current wallet index from state file: ${currentIndex + 1}/${this.walletKeypairs.length}`);
                }
            }
            // Update state with current index
            this.updateStateFile(currentIndex);
            if (isMainThread) {
                // Initialize strategies for all wallets first
                this.initializeStrategies();
                // Start sequential wallet processing
                this.startSequentialProcessing();
                // Handle graceful shutdown
                const shutdown = async () => {
                    console.log('Initiating graceful shutdown...');
                    // Stop all timers first
                    if (this.healthCheckInterval) {
                        clearInterval(this.healthCheckInterval);
                        this.healthCheckInterval = null;
                    }
                    if (this.processingTimer) {
                        clearTimeout(this.processingTimer);
                        this.processingTimer = null;
                    }
                    // Mark as not processing to prevent new operations
                    this.isProcessing = false;
                    this.walletOperationInProgress = false;
                    try {
                        // Save current wallet state before cleaning up
                        this.logger.info('Saving wallet processing state before shutdown...');
                        this.saveWalletState();
                        // Cleanup all connections and resources
                        // await this.cleanup();
                        await this.cleanup();
                        console.log('Shutdown complete');
                    }
                    catch (err) {
                        console.error('Error during shutdown:', err);
                    }
                    finally {
                        // Always exit even if cleanup fails
                        process.exit(0);
                    }
                };
                // Handle different shutdown signals
                process.on('SIGTERM', shutdown);
                process.on('SIGINT', shutdown);
                process.on('SIGUSR2', shutdown); // PM2 specific signal
                // Handle PM2 graceful shutdown
                process.on('message', async (msg) => {
                    if (msg === 'shutdown') {
                        await shutdown();
                    }
                });
            }
        }
        catch (error) {
            this.logger.error('Fatal error:', error);
            // await this.cleanup();
            await this.cleanup();
            process.exit(1);
        }
    }
    // Initialize strategies for all wallets
    initializeStrategies() {
        const Strategy = this.loadStrategy(process.env.TRADE_TYPE);
        // For market making (sol_spl), initialize per wallet without JupiterClient
        for (let i = 0; i < this.walletKeypairs.length; i++) {
            const keypair = this.walletKeypairs[i];
            const publicKey = keypair.publicKey.toString();
            // Get connection
            const connection = this.getConnection(this.rpcEndpoints[0]);
            // Create strategy without JupiterClient
            const strategyKey = `${publicKey}-${process.env.TRADE_TYPE}`;
            const strategy = new Strategy(connection);
            // Set up event listeners
            this.setupStrategyEvents(strategy, publicKey);
            // Add to strategy instances map
            this.strategyInstances.set(strategyKey, strategy);
            console.log(`Initialized strategy for wallet ${i + 1}/${this.walletKeypairs.length}: ${publicKey.substring(0, 8)}...`);
        }
    }
    // Set up event listeners for a strategy
    setupStrategyEvents(strategy, publicKey) {
        // Handle buy events
        strategy.on('tokenBought', (data) => {
            console.log(`Wallet ${publicKey.substring(0, 8)} bought token:`, {
                symbol: data.symbol,
                token: data.token,
                amount: data.amount
            });
        });
        // Handle sell events
        strategy.on('tokenSold', (data) => {
            console.log(`Wallet ${publicKey.substring(0, 8)} sold token:`, {
                symbol: data.symbol,
                token: data.token
            });
        });
        // Handle transaction errors
        strategy.on('transactionError', (data) => {
            console.error(`Transaction error for wallet ${publicKey.substring(0, 8)}:`, data);
        });
    }
    // Start sequential wallet processing
    startSequentialProcessing() {
        this.isProcessing = true;
        // Load saved state if it exists
        try {
            if (fs.existsSync(this.stateFilePath)) {
                const stateData = JSON.parse(fs.readFileSync(this.stateFilePath, 'utf8'));
                if (stateData && typeof stateData.currentWalletIndex === 'number') {
                    // Only use saved state if we haven't manually set a new index
                    if (this.currentWalletIndex === 0) {
                        this.currentWalletIndex = stateData.currentWalletIndex;
                        this.logger.info(`Resuming from saved wallet index: ${this.currentWalletIndex + 1}/${this.walletKeypairs.length}`);
                    }
                    else {
                        this.logger.info(`Using manually set wallet index: ${this.currentWalletIndex + 1}/${this.walletKeypairs.length}`);
                    }
                    // Display the resumed wallet's public key for confirmation
                    if (this.walletKeypairs[this.currentWalletIndex] && this.walletKeypairs[this.currentWalletIndex].publicKey) {
                        const walletKey = this.walletKeypairs[this.currentWalletIndex].publicKey.toString();
                        this.logger.info(`Starting with wallet: ${walletKey.substring(0, 8)}...${walletKey.substring(walletKey.length - 4)}`);
                        // Display timestamp information
                        if (stateData.timestamp) {
                            const lastRunTime = new Date(stateData.timestamp);
                            const timeDiff = Date.now() - stateData.timestamp;
                            const minutesAgo = Math.floor(timeDiff / (1000 * 60));
                            this.logger.info(`Last wallet operation was ${minutesAgo} minutes ago at ${lastRunTime.toLocaleString()}`);
                        }
                    }
                    // Restore retry attempts if available
                    if (stateData.retryAttempts && Array.isArray(stateData.retryAttempts)) {
                        this.walletRetryMap = new Map(stateData.retryAttempts);
                        this.logger.debug(`Restored ${this.walletRetryMap.size} wallet retry counters from state`);
                    }
                    // Restore cycle information if available
                    if (stateData.currentCycle && typeof stateData.currentCycle === 'number') {
                        this.currentCycle = stateData.currentCycle;
                        // Keep maxCycles from environment variable or use saved value as fallback
                        if (!this.maxCycles && stateData.maxCycles) {
                            this.maxCycles = stateData.maxCycles;
                        }
                        this.logger.info(`Resuming from cycle ${this.currentCycle} of ${this.maxCycles}`);
                    }
                }
                else {
                    this.currentWalletIndex = 0;
                    this.logger.info('Starting from first wallet (no valid state data found)');
                }
            }
            else {
                this.currentWalletIndex = 0;
                this.logger.info('Starting from first wallet (no state file found)');
            }
        }
        catch (error) {
            this.currentWalletIndex = 0;
            this.logger.error('Error reading state file, starting from first wallet:', error);
        }
        // Ensure index is valid (in case wallet list changed since last run)
        if (this.currentWalletIndex >= this.walletKeypairs.length) {
            this.logger.warn(`Wallet index ${this.currentWalletIndex} is out of range, resetting to 0`);
            this.currentWalletIndex = 0;
        }
        this.walletOperationInProgress = false;
        this.logger.info('Starting sequential wallet processing...');
        this.logger.info(`Total wallets to process: ${this.walletKeypairs.length}`);
        this.logger.info(`Starting from wallet index: ${this.currentWalletIndex}`);
        this.processNextWallet();
    }
    // Save current wallet processing state to file
    saveWalletState() {
        try {
            // Ensure directory exists
            const dir = path.dirname(this.stateFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const stateData = {
                currentWalletIndex: this.currentWalletIndex,
                timestamp: Date.now(),
                totalWallets: this.walletKeypairs.length,
                retryAttempts: Array.from(this.walletRetryMap.entries()),
                currentCycle: this.currentCycle,
                maxCycles: this.maxCycles
            };
            fs.writeFileSync(this.stateFilePath, JSON.stringify(stateData, null, 2));
            this.logger.debug(`Saved wallet state: index ${this.currentWalletIndex + 1}/${this.walletKeypairs.length} (Cycle ${this.currentCycle}/${this.maxCycles})`);
        }
        catch (error) {
            this.logger.error('Error saving wallet state:', error);
        }
    }
    // Set wallet index manually
    setWalletIndex(index) {
        try {
            // Validate index
            if (typeof index !== 'number' || index < 0 || index >= this.walletKeypairs.length) {
                throw new Error(`Invalid index. Must be between 0 and ${this.walletKeypairs.length - 1}`);
            }
            // Update current index
            this.currentWalletIndex = index;
            // Save to state file
            this.saveWalletState();
            this.logger.info(`Wallet index manually set to ${index + 1}/${this.walletKeypairs.length}`);
            return true;
        }
        catch (error) {
            this.logger.error('Error setting wallet index:', error.message);
            return false;
        }
    }
    // Update state file directly with new index
    updateStateFile(newIndex) {
        try {
            // Create the state file if it doesn't exist
            if (!fs.existsSync(this.stateFilePath)) {
                // Create a new state data object
                const newStateData = {
                    currentWalletIndex: newIndex,
                    timestamp: Date.now(),
                    totalWallets: this.walletKeypairs.length,
                    retryAttempts: [],
                    currentCycle: this.currentCycle,
                    maxCycles: this.maxCycles
                };
                // Ensure directory exists
                const dir = path.dirname(this.stateFilePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                // Write new state file
                fs.writeFileSync(this.stateFilePath, JSON.stringify(newStateData, null, 2));
                this.logger.info(`Created new state file with wallet index ${newIndex + 1}/${this.walletKeypairs.length}`);
                return true;
            }
            // Read current state
            const stateData = JSON.parse(fs.readFileSync(this.stateFilePath, 'utf8'));
            // If totalWallets is missing or has changed, update it
            if (!stateData.totalWallets || stateData.totalWallets !== this.walletKeypairs.length) {
                stateData.totalWallets = this.walletKeypairs.length;
            }
            // Validate new index
            if (typeof newIndex !== 'number' || newIndex < 0 || newIndex >= this.walletKeypairs.length) {
                throw new Error(`Invalid index. Must be between 0 and ${this.walletKeypairs.length - 1}`);
            }
            // Update index and timestamp
            stateData.currentWalletIndex = newIndex;
            stateData.timestamp = Date.now();
            stateData.currentCycle = this.currentCycle;
            stateData.maxCycles = this.maxCycles;
            // Write back to file
            fs.writeFileSync(this.stateFilePath, JSON.stringify(stateData, null, 2));
            // Update current index in memory
            this.currentWalletIndex = newIndex;
            this.logger.info(`State file updated. Wallet index set to ${newIndex + 1}/${stateData.totalWallets} (Cycle ${this.currentCycle}/${this.maxCycles})`);
            return true;
        }
        catch (error) {
            this.logger.error('Error updating state file:', error.message);
            // Try creating a new state file as a fallback
            try {
                const newStateData = {
                    currentWalletIndex: newIndex,
                    timestamp: Date.now(),
                    totalWallets: this.walletKeypairs.length,
                    retryAttempts: [],
                    currentCycle: this.currentCycle,
                    maxCycles: this.maxCycles
                };
                // Ensure directory exists
                const dir = path.dirname(this.stateFilePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(this.stateFilePath, JSON.stringify(newStateData, null, 2));
                this.logger.info(`Created new state file as fallback with wallet index ${newIndex + 1}/${this.walletKeypairs.length}`);
                return true;
            }
            catch (fallbackError) {
                this.logger.error('Failed to create state file fallback:', fallbackError.message);
                return false;
            }
        }
    }
    // Process next wallet in sequence
    async processNextWallet() {
        if (!this.isProcessing || this.walletOperationInProgress) {
            return;
        }
        this.walletOperationInProgress = true;
        try {
            // Get current and next wallet
            const currentWallet = this.walletKeypairs[this.currentWalletIndex];
            if (!currentWallet || !currentWallet.publicKey) {
                console.error(`Invalid wallet at index ${this.currentWalletIndex}`);
                this.currentWalletIndex = (this.currentWalletIndex + 1) % this.walletKeypairs.length;
                // Save state after updating index
                this.saveWalletState();
                this.walletOperationInProgress = false;
                this.processingTimer = setTimeout(() => this.processNextWallet(), 5000);
                return;
            }
            const currentWalletKey = currentWallet.publicKey.toString();
            // Check for too many retries of the same wallet
            const retryCount = this.walletRetryMap.get(currentWalletKey) || 0;
            if (retryCount >= this.MAX_WALLET_RETRIES) {
                this.logger.warn(`Wallet ${currentWalletKey.substring(0, 8)} has been retried ${retryCount} times. Skipping to next wallet.`);
                // Move to next wallet after too many retries
                const nextIndex = (this.currentWalletIndex + 1) % this.walletKeypairs.length;
                this.currentWalletIndex = nextIndex;
                // Reset retry counter for this wallet
                this.walletRetryMap.delete(currentWalletKey);
                // Save state
                this.saveWalletState();
                this.walletOperationInProgress = false;
                this.processingTimer = setTimeout(() => this.processNextWallet(), 5000);
                return;
            }
            // Calculate next wallet index (circular)
            const nextIndex = (this.currentWalletIndex + 1) % this.walletKeypairs.length;
            const nextWallet = this.walletKeypairs[nextIndex];
            this.logger.info(`Processing wallet ${this.currentWalletIndex + 1}/${this.walletKeypairs.length}: ${currentWalletKey.substring(0, 8)}...`);
            // Pre-check wallet balance to avoid wasting time on empty wallets
            // Only check balances for market making mode (sol_spl)
            if (process.env.TRADE_TYPE.toLowerCase() === 'sol_spl') {
                try {
                    // Get connection - with fallback if needed
                    let connection;
                    try {
                        connection = this.getConnection(this.rpcEndpoints[0]);
                    }
                    catch (connError) {
                        console.error(`Error getting primary connection: ${connError.message}`);
                        if (this.rpcEndpoints.length > 1) {
                            console.log('Trying backup RPC endpoint...');
                            connection = this.getConnection(this.rpcEndpoints[1]);
                        }
                        else {
                            throw connError;
                        }
                    }
                    const walletBalance = await connection.getBalance(currentWallet.publicKey);
                    const balanceInSOL = walletBalance / 1e9;
                    // If balance is too low, skip to next wallet
                    if (walletBalance < 0.0005 * 1e9) { // Less than 0.0005 SOL
                        console.log(`Wallet ${this.currentWalletIndex + 1} has insufficient balance (${balanceInSOL} SOL). Skipping to next wallet.`);
                        this.currentWalletIndex = nextIndex;
                        this.walletOperationInProgress = false;
                        // Use a shorter delay for empty wallets
                        const shortDelay = 5000 + Math.floor(Math.random() * 3000);
                        this.processingTimer = setTimeout(() => this.processNextWallet(), shortDelay);
                        return;
                    }
                    console.log(`Wallet ${this.currentWalletIndex + 1} has ${balanceInSOL} SOL. Proceeding with trading.`);
                }
                catch (balanceError) {
                    console.warn(`Could not check wallet balance: ${balanceError.message}. Will attempt to proceed anyway.`);
                }
            }
            // Get strategy instance
            const strategyKey = `${currentWalletKey}-${TRADE_TYPE}`;
            const strategy = this.strategyInstances.get(strategyKey);
            if (!strategy) {
                console.error(`No strategy instance for ${currentWalletKey}`);
                // Move to next wallet and retry
                this.currentWalletIndex = nextIndex;
                this.walletOperationInProgress = false;
                this.processingTimer = setTimeout(() => this.processNextWallet(), 1000);
                return;
            }
            let result;
            // Check if this is a market-making strategy (sol_spl) or a signal-only strategy
            if (process.env.TRADE_TYPE.toLowerCase() === 'sol_spl') {
                // For sol_spl, run JITO market making
                console.log(`Executing 2:1 buy/sell cycle with wallet ${this.currentWalletIndex + 1} and transferring to wallet ${nextIndex + 1}`);
                result = await this.executeMarketMaking(strategy, currentWallet, nextWallet, process.env.TRADE_TYPE);
            }
            else {
                // For signal-only strategies, use the global strategy instance
                const strategyKey = `global-${process.env.TRADE_TYPE}`;
                const strategy = this.strategyInstances.get(strategyKey);
                if (!strategy) {
                    console.error(`No strategy instance for ${strategyKey}`);
                    this.walletOperationInProgress = false;
                    this.processingTimer = setTimeout(() => this.processNextWallet(), 1000);
                    return;
                }
                console.log(`Executing signal-only ${process.env.TRADE_TYPE} strategy`);
                result = await this.executeStrategy(strategy, process.env.TRADE_TYPE, true);
            }
            if (result.success) {
                console.log(`Success! Completed cycle with wallet ${this.currentWalletIndex + 1} and transferred SOL to wallet ${nextIndex + 1}`);
                // For sol_spl, verify balance transfer if needed
                if (process.env.TRADE_TYPE.toLowerCase() === 'sol_spl' && result.transferSuccess && !result.transferVerified) {
                    try {
                        // Get a fresh connection for balance check
                        const connection = this.getConnection(this.rpcEndpoints[0]);
                        // Reduce wait time from 5 to 3 seconds
                        console.log(`Waiting additional 3 seconds to verify balance transfer...`);
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        // Check balance of next wallet
                        const nextWalletBalance = await connection.getBalance(nextWallet.publicKey);
                        console.log(`Verified next wallet balance: ${nextWalletBalance / 1e9} SOL`);
                        // If balance is too low, try refreshing once more with longer wait
                        if (nextWalletBalance < 10000) { // Less than 0.00001 SOL
                            console.warn(`Next wallet balance is very low: ${nextWalletBalance / 1e9} SOL. Waiting longer...`);
                            // Reduce wait time from 15 to 10 seconds
                            await new Promise(resolve => setTimeout(resolve, 10000));
                            // Check again
                            const refreshedBalance = await connection.getBalance(nextWallet.publicKey);
                            console.log(`Refreshed next wallet balance: ${refreshedBalance / 1e9} SOL`);
                            if (refreshedBalance < 10000) {
                                // Still too low, log warning but continue
                                console.warn(`❌ Transfer verification failed! Next wallet has insufficient balance: ${refreshedBalance / 1e9} SOL`);
                                // Try one more time with a different RPC endpoint
                                if (this.rpcEndpoints.length > 1) {
                                    try {
                                        const altConnection = this.getConnection(this.rpcEndpoints[1]);
                                        console.log(`Trying alternate RPC endpoint for balance check...`);
                                        const altBalance = await altConnection.getBalance(nextWallet.publicKey);
                                        console.log(`Alternate RPC next wallet balance: ${altBalance / 1e9} SOL`);
                                        if (altBalance >= 10000) {
                                            console.log(`✅ Balance verified with alternate RPC: ${altBalance / 1e9} SOL`);
                                        }
                                        else {
                                            console.error(`❌ Transfer verification failed with both RPCs! Balance: ${altBalance / 1e9} SOL`);
                                        }
                                    }
                                    catch (verifyError) {
                                        console.error(`Error verifying next wallet balance:`, verifyError);
                                    }
                                }
                            }
                        }
                    }
                    catch (verifyError) {
                        console.error(`Error verifying next wallet balance:`, verifyError);
                    }
                }
                else if (TRADE_TYPE.toLowerCase() === 'sol_spl' && result.transferVerified) {
                    console.log(`✅ Transfer already verified at the strategy level - next wallet has received funds`);
                }
                // Move to next wallet
                this.currentWalletIndex = nextIndex;
                this.logger.info(`Next operation will use wallet ${this.currentWalletIndex + 1}/${this.walletKeypairs.length}`);
                // Save state after successful wallet processing
                this.saveWalletState();
            }
            else {
                // Check for API errors that need to be retried
                const isApiError = result.error?.includes('API returned status') ||
                    result.error?.includes('PumpFun API error') ||
                    result.error?.includes('API fetch error') ||
                    result.error?.includes('Failed to fetch');
                if (isApiError) {
                    this.logger.warn(`API error detected: "${result.error}". Will retry the same wallet after backoff.`);
                    // Increment retry counter for this wallet
                    this.walletRetryMap.set(currentWalletKey, (this.walletRetryMap.get(currentWalletKey) || 0) + 1);
                    this.logger.info(`Wallet ${currentWalletKey.substring(0, 8)} retry count: ${this.walletRetryMap.get(currentWalletKey)}/${this.MAX_WALLET_RETRIES}`);
                    // Save state with updated retry counter
                    this.saveWalletState();
                    // Don't increment wallet index - retry the same wallet
                    // Use longer backoff for API errors (25-45 seconds)
                    const apiErrorBackoff = 1000 + Math.floor(Math.random() * 5000);
                    this.logger.info(`Using backoff time of ${apiErrorBackoff / 1000}s before retrying the same wallet`);
                    this.walletOperationInProgress = false;
                    this.processingTimer = setTimeout(() => this.processNextWallet(), apiErrorBackoff);
                    return;
                }
                // Handle specific errors that indicate we should skip this wallet
                const skipWallet = result.error?.includes('Insufficient balance') ||
                    result.error?.includes('Balance too low') ||
                    result.error?.includes('Failed to get wallet balance');
                if (skipWallet) {
                    this.logger.warn(`Skipping wallet ${this.currentWalletIndex + 1} due to balance issue: ${result.error}`);
                    this.currentWalletIndex = nextIndex;
                    // Reset retry counter for this wallet since we're moving on
                    this.walletRetryMap.delete(currentWalletKey);
                    // Save state after skipping wallet
                    this.saveWalletState();
                }
                else {
                    this.logger.error(`Failed to complete cycle with wallet ${this.currentWalletIndex + 1}: ${result.error}`);
                    // If trading succeeded but transfer failed, still move to next wallet
                    if (result.tradingSuccess && !result.transferSuccess) {
                        this.logger.warn(`Trading succeeded but transfer failed. Moving to next wallet anyway.`);
                        this.currentWalletIndex = nextIndex;
                        // Reset retry counter for this wallet since we're moving on
                        this.walletRetryMap.delete(currentWalletKey);
                        // Save state after moving to next wallet
                        this.saveWalletState();
                    }
                    else {
                        // Increment retry counter for other errors too
                        this.walletRetryMap.set(currentWalletKey, (this.walletRetryMap.get(currentWalletKey) || 0) + 1);
                        const retryCount = this.walletRetryMap.get(currentWalletKey);
                        this.logger.info(`Wallet ${currentWalletKey.substring(0, 8)} retry count: ${retryCount}/${this.MAX_WALLET_RETRIES}`);
                        // If we've hit max retries, move to next wallet
                        if (retryCount >= this.MAX_WALLET_RETRIES) {
                            this.logger.warn(`Wallet ${currentWalletKey.substring(0, 8)} hit max retries (${retryCount}). Moving to next wallet.`);
                            this.currentWalletIndex = nextIndex;
                            this.walletRetryMap.delete(currentWalletKey);
                        }
                        // For complete failures, use random backoff before trying next wallet
                        const backoffTime = 1000 + Math.floor(Math.random() * 5000); // 5-15 seconds
                        this.logger.info(`Using backoff time of ${backoffTime / 1000}s before trying next wallet`);
                        await new Promise(resolve => setTimeout(resolve, backoffTime));
                        // If we're still under max retries, we'll stay on the same wallet
                        // Otherwise, we already set the index to the next wallet above
                        // Save state after moving to next wallet or updating retry count
                        this.saveWalletState();
                    }
                }
            }
        }
        catch (error) {
            this.logger.error(`Error processing wallet ${this.currentWalletIndex + 1}:`, error);
            // Move to next wallet on error
            this.currentWalletIndex = (this.currentWalletIndex + 1) % this.walletKeypairs.length;
            // Save state after error recovery
            this.saveWalletState();
        }
        // Add cooldown between wallet operations (reduced from 12-20 to 3-6 seconds for higher frequency)
        const cooldownDelay = 1000 + Math.floor(Math.random() * 5000);
        this.logger.info(`Waiting ${cooldownDelay / 1000}s before next operation cycle...`);
        // Schedule next wallet processing
        this.processingTimer = setTimeout(() => {
            this.logger.info('Cooldown complete. Ready for next wallet operation.');
            this.walletOperationInProgress = false;
            this.processNextWallet();
        }, cooldownDelay);
    }
    async cleanup() {
        try {
            this.logger.info('Cleaning up resources before shutdown...');
            // Close Redis connection if it exists and is open
            if (this.redisClient) {
                try {
                    if (this.redisClient.isOpen) {
                        this.logger.info('Closing Redis connection...');
                        await this.redisClient.quit();
                    }
                    else {
                        this.logger.info('Redis connection already closed');
                    }
                }
                catch (redisErr) {
                    this.logger.error('Error closing Redis connection:', redisErr);
                }
            }
            // Clean up strategy instances
            if (this.strategyInstances && this.strategyInstances.size > 0) {
                this.logger.info(`Cleaning up ${this.strategyInstances.size} strategy instances...`);
                for (const [key, strategy] of this.strategyInstances.entries()) {
                    if (strategy && typeof strategy.cleanup === 'function') {
                        try {
                            await strategy.cleanup();
                        }
                        catch (err) {
                            this.logger.error(`Error cleaning up strategy ${key}:`, err);
                        }
                    }
                }
            }
            // Clear any timers
            if (this.processingTimer) {
                clearTimeout(this.processingTimer);
                this.processingTimer = null;
            }
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
            }
            // Save final wallet state
            try {
                this.saveWalletState();
            }
            catch (stateErr) {
                this.logger.error('Error saving wallet state during cleanup:', stateErr);
            }
            this.logger.info('Cleanup completed successfully');
        }
        catch (error) {
            this.logger.error('Error during cleanup:', error);
        }
    }
    static run() {
        const instance = new Bot();
        instance.main().catch((err) => {
            console.error('Fatal error:', err);
            instance.cleanup();
            process.exit(1);
        });
    }
    // Simplify analyzeMarket to not use neural network
    async analyzeMarket(tokenAddress) {
        // Return a simple default action for sol_spl strategy
        return { action: 'default', confidence: 0 };
    }
    // Add a function to handle rate limits with exponential backoff
    async handleRateLimit(operation, maxRetries = 3) {
        let delay = 1000; // Start with 1 second delay
        let attempt = 0;
        while (attempt < maxRetries) {
            try {
                attempt++;
                return await operation();
            }
            catch (error) {
                // Check if it's a rate limit error
                if (error.message && (error.message.includes("429") ||
                    error.message.includes("Too Many Requests") ||
                    error.message.includes("Rate limit") ||
                    error.message.includes("CreditsExhausted"))) {
                    console.log(`Rate limit encountered. Attempt ${attempt}/${maxRetries}. Backing off for ${delay / 1000}s`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    // Exponential backoff with jitter
                    delay = delay * 2 + Math.floor(Math.random() * 1000);
                }
                else {
                    // Not a rate limit error, rethrow
                    throw error;
                }
            }
        }
        // All retries failed
        throw new Error(`Failed after ${maxRetries} attempts due to rate limits`);
    }
}
Bot.run();
