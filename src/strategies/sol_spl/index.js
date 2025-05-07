"use strict";
require('dotenv').config();
const logger = require('@utils/logger');
const { sleep } = require("@utils/sleep");
const { Connection, PublicKey, VersionedTransaction, SystemProgram, Transaction } = require('@solana/web3.js');
const bs58 = require('bs58');
const {
    TOKEN_DECIMALS,
    CONTRACT_ADDRESS,
    SOL_MINT_ADDRESS,
    SOL_SYMBOL,
    TOKEN_SYMBOL,
    MAX_TRADE_AMOUNT,
    MIN_TRADE_AMOUNT
} = require("@constants/constants");
const { EventEmitter } = require('events');

// Constants for PumpFun and JITO
const PUMPFUN_API_URL = 'https://pumpportal.fun/api/trade-local';
const JITO_BUNDLE_URL = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';
const PRIORITY_FEE = 0.005;

// Set default values for trade amounts if not provided in env vars
const DEFAULT_MAX_TRADE = MAX_TRADE_AMOUNT || 0.005; // Reduced from 0.05 to 0.005 SOL
const DEFAULT_MIN_TRADE = MIN_TRADE_AMOUNT || 0.0005; // Reduced from 0.005 to 0.0005 SOL

class SolSpl extends EventEmitter {
    constructor(connection, jupiterClient) {
        super();
        this.setMaxListeners(0);
        this.connection = connection;
        // We don't need jupiterClient anymore since we're using direct API calls
        // but keep the parameter for backward compatibility
        this.logger = {
            info: (message) => console.log(message),
            warn: (message) => console.warn(message),
            error: (message) => console.error(message),
            debug: (message) => console.debug(message)
        };
        
        // Token definitions - splToken address will be set during executeBuy/executeSell
        this.solToken = { address: SOL_MINT_ADDRESS, symbol: SOL_SYMBOL, decimals: 9 };
        
        // Parameters from environment with sensible defaults
        this.buyAmount = parseFloat(process.env.BUY_AMOUNT) || 0.05;
        this.sellAmount = parseFloat(process.env.SELL_AMOUNT) || 100;
        this.slippageBps = parseInt(process.env.SLIPPAGE_BPS) || 50;
        this.useJito = process.env.USE_JITO === 'true';
        
        // Cache for wallet balances
        this.cachedBalance = null;
    }
    
    // Set wallet balance data
    setBalance(balance) {
        this.logger.info('Setting cached balance:', balance);
        this.cachedBalance = balance;
    }
    
    // Execute a buy operation using PumpFun Portal
    async executeBuy(keypair, solAmount) {
        try {
            // Get the trading pair
            const pair = this.activePairs[0];
            if (!pair) {
                this.logger.error('No active trading pair defined');
                return { success: false, error: 'No trading pair' };
            }
            
            // Verify the token mint address exists
            if (!pair.token1.address) {
                this.logger.error('Token mint address is not defined. Check CONTRACT_ADDRESS env variable.');
                return { success: false, error: 'Token mint address is not configured' };
            }
            
            this.logger.info(`Using token mint address: ${pair.token1.address}`);
            
            // Check if this is a whale buy (>= 1 SOL)
            const isWhaleBuy = solAmount >= 1.0;
            
            // Add a random initial delay before starting the buy 
            const initialDelay = Math.floor(Math.random() * 500) + 100;
            this.logger.debug(`Adding initial delay of ${initialDelay}ms before buy operation${isWhaleBuy ? ' (WHALE BUY)' : ''}`);
            await new Promise(resolve => setTimeout(resolve, initialDelay));
            
            this.logger.info(`Executing buy of ${pair.token1.symbol || 'token'} with ${solAmount} SOL${isWhaleBuy ? ' (WHALE BUY)' : ''}`);
            
            // Get API key from keypair or use environment variable as fallback
            const apiKey = keypair.apiKey || process.env.PUMPFUN_API_KEY;
            if (apiKey) {
                this.logger.info(`Using API key: ${apiKey.substring(0, 8)}...`);
            } else {
                this.logger.warn('No API key found in wallet or environment variable');
            }
            
            // Prepare data for PumpFun API
            const data = {
                publicKey: keypair.publicKey.toString(),
                action: 'buy',
                mint: pair.token1.address,
                denominatedInSol: 'true',
                amount: solAmount.toString(),
                slippage: 1,
                priorityFee: 0.00003,
                pool: 'auto'  // Use auto pool selection
            };
            
            this.logger.info(`Sending buy request to PumpFun for ${pair.token1.symbol || 'token'} (${pair.token1.address})`);
            
            // Call PumpFun API with apiKey from the wallet
            const response = await fetch(`https://pumpportal.fun/api/trade?api-key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            if (response.status !== 200) {
                const errorText = await response.text();
                this.logger.error(`PumpFun API error: ${response.status} - ${errorText}`);
                return { success: false, error: `API returned status ${response.status}: ${errorText}` };
            }
            
            // Parse the JSON response
            const jsonResponse = await response.json();
            this.logger.info('Received JSON response from PumpFun API:', jsonResponse);
            
            // Check for errors in response
            if (jsonResponse.errors && jsonResponse.errors.length > 0) {
                const errorMsg = jsonResponse.errors.join(', ');
                this.logger.error(`PumpFun API returned errors: ${errorMsg}`);
                return { success: false, error: errorMsg };
            }
            
            // If we have a signature, the transaction was already executed by the API
            if (jsonResponse.signature) {
                this.logger.info(`Buy transaction executed by API with signature: https://solscan.io/tx/${jsonResponse.signature}`);
                
                // Emit tokenBought event
                this.emit('tokenBought', {
                    token: pair.token1.address,
                    symbol: pair.token1.symbol || 'token',
                    signature: jsonResponse.signature,
                    amount: solAmount
                });
                
                return { success: true, signature: jsonResponse.signature };
            }
            
            // If we didn't get a signature, return an error
            this.logger.error('No signature found in API response');
            return { success: false, error: 'No signature in API response' };
            
        } catch (error) {
            this.logger.error(`Buy execution error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    
    // Execute a sell operation using PumpFun Portal
    async executeSell(keypair) {
        try {
            // Get the current contract address from environment variable
            const tokenMintAddress = process.env.CONTRACT_ADDRESS;
            if (!tokenMintAddress) {
                this.logger.error('Token mint address is not defined. Check CONTRACT_ADDRESS env variable.');
                return { success: false, error: 'Token mint address is not configured' };
            }
            
            this.logger.info(`Using token contract address: ${tokenMintAddress}`);
            
            // Set up the token and trading pair
            this.splToken = { address: tokenMintAddress, symbol: TOKEN_SYMBOL || 'TOKEN', decimals: TOKEN_DECIMALS || 9 };
            
            // Set up the active trading pair with the current token
            this.activePairs = [
                { token0: this.solToken, token1: this.splToken, pool: 'auto' }
            ];
            
            // Get the trading pair
            const pair = this.activePairs[0];
            if (!pair) {
                this.logger.error('No active trading pair defined');
                return { success: false, error: 'No trading pair' };
            }
            
            // Add a random initial delay before starting the sell
            const initialDelay = Math.floor(Math.random() * 500) + 300;
            this.logger.debug(`Adding initial delay of ${initialDelay}ms before sell operation`);
            await new Promise(resolve => setTimeout(resolve, initialDelay));
            
            this.logger.info(`Executing sell of ${pair.token1.symbol || 'token'} (${pair.token1.address})`);
            
            // Get API key from keypair or use environment variable as fallback
            const apiKey = keypair.apiKey || process.env.PUMPFUN_API_KEY;
            if (apiKey) {
                this.logger.info(`Using API key for sell: ${apiKey.substring(0, 8)}...`);
            } else {
                this.logger.warn('No API key found in wallet or environment variable for sell operation');
            }
            
            // Always sell 100% of tokens
            const randomPercentage = Math.floor(Math.random() * 21) + 80; // Random number between 80 and 100
            const sellPercentage = `${randomPercentage}%`;
            
            // Prepare data for PumpFun API
            const data = {
                publicKey: keypair.publicKey.toString(),
                action: 'sell',
                mint: pair.token1.address,
                denominatedInSol: 'false',
                amount: sellPercentage,
                slippage: 1,
                priorityFee: 0.00003,
                pool: 'auto'
            };
            
            this.logger.info(`Sending sell request to PumpFun for ${pair.token1.symbol || 'token'} (${pair.token1.address})`);
            
            // Call PumpFun API with apiKey from the wallet
            const response = await fetch(`https://pumpportal.fun/api/trade?api-key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            if (response.status !== 200) {
                const errorText = await response.text();
                this.logger.error(`PumpFun API error: ${response.status} - ${errorText}`);
                return { success: false, error: `API returned status ${response.status}: ${errorText}` };
            }
            
            // Parse the JSON response
            const jsonResponse = await response.json();
            this.logger.info('Received JSON response from PumpFun API for sell operation:', jsonResponse);
            
            // Check for errors in response
            if (jsonResponse.errors && jsonResponse.errors.length > 0) {
                const errorMsg = jsonResponse.errors.join(', ');
                this.logger.error(`PumpFun API returned errors for sell: ${errorMsg}`);
                return { success: false, error: errorMsg };
            }
            
            // If we have a signature, the sell transaction was already executed by the API
            if (jsonResponse.signature) {
                this.logger.info(`Sell transaction executed by API with signature: https://solscan.io/tx/${jsonResponse.signature}`);
                
                // Emit tokenSold event
                this.emit('tokenSold', {
                    token: pair.token1.address,
                    symbol: pair.token1.symbol || 'token',
                    signature: jsonResponse.signature
                });
                
                return { success: true, signature: jsonResponse.signature };
            }
            
            // If we didn't get a signature, return an error
            this.logger.error('No signature found in API response for sell');
            return { success: false, error: 'No signature in API response for sell' };
            
        } catch (error) {
            this.logger.error(`Sell execution error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    
    // Execute bundle of transactions using JITO
    async executeBundledTrades(operations, keypairs) {
        try {
            this.logger.info(`Executing bundled trades with ${operations.length} operations`);
            
            // Validate input parameters
            if (!operations || operations.length === 0 || !keypairs || keypairs.length === 0) {
                this.logger.error('Invalid bundle parameters');
                return { success: false, error: 'Invalid bundle parameters' };
            }
            
            if (operations.length !== keypairs.length) {
                this.logger.error('Number of operations must match number of keypairs');
                return { success: false, error: 'Operations and keypairs count mismatch' };
            }
            
            // Safety limit on operations
            if (operations.length > 5) {
                this.logger.warn('Limiting bundle to 5 operations');
                operations = operations.slice(0, 5);
                keypairs = keypairs.slice(0, 5);
            }
            
            // Prepare bundle arguments - directly match the format shown in the example
            const bundledTxArgs = operations.map((op, i) => {
                return {
                    publicKey: keypairs[i].publicKey.toBase58(),
                    action: op.action,
                    mint: op.mint || this.activePairs[0].token1.address,
                    denominatedInSol: op.denominatedInSol || 'true',
                    amount: op.amount || "100%",
                    slippage: op.slippage || 1,
                    priorityFee: i === 0 ? 0.00005 : 0, // Only first transaction needs priority fee for JITO tip
                    pool: op.pool || 'auto'
                };
            });
            
            this.logger.info('Requesting bundled transactions from PumpFun');
            
            // Make the API request
            const response = await fetch('https://pumpportal.fun/api/trade-local', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bundledTxArgs)
            });
            
            // Handle API error response
            if (response.status !== 200) {
                this.logger.error(`PumpFun API error: ${response.status}`);
                return { success: false, error: `API returned status ${response.status}` };
            }
            
            // Get transaction data
            const transactions = await response.json();
            
            if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
                this.logger.error('Received invalid transactions from PumpFun API');
                return { success: false, error: 'Invalid transactions received' };
            }
            
            // Sign the transactions
            let encodedSignedTransactions = [];
            let signatures = [];
            
            for (let i = 0; i < Math.min(bundledTxArgs.length, transactions.length); i++) {
                try {
                    const tx = VersionedTransaction.deserialize(new Uint8Array(bs58.decode(transactions[i])));
                    tx.sign([keypairs[i]]);
                    encodedSignedTransactions.push(bs58.encode(tx.serialize()));
                    signatures.push(bs58.encode(tx.signatures[0]));
                } catch (signError) {
                    this.logger.error(`Error signing transaction ${i}: ${signError.message}`);
                    return { success: false, error: `Failed to sign transaction ${i}: ${signError.message}` };
                }
            }
            
            this.logger.info(`Successfully signed ${encodedSignedTransactions.length} transactions`);
            this.logger.info('Sending bundle to JITO');
            
            // Add a small delay before sending
            const jitoDelay = Math.floor(Math.random() * 500) + 300;
            await new Promise(resolve => setTimeout(resolve, jitoDelay));
            
            // Send to JITO with retry logic
            const MAX_RETRIES = 10;
            let lastError = null;
            
            for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
                try {
                    if (attempt > 0) {
                        this.logger.info(`JITO retry attempt ${attempt + 1}/${MAX_RETRIES}`);
                        // Add delay between retries with exponential backoff
                        const retryDelay = Math.min(2000 * Math.pow(2, attempt), 8000);
                        this.logger.info(`Waiting ${retryDelay}ms before retry...`);
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                    }
                    
                    const jitoResponse = await fetch('https://mainnet.block-engine.jito.wtf/api/v1/bundles', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            id: 1,
                            method: 'sendBundle',
                            params: [encodedSignedTransactions]
                        })
                    });
                    
                    const jitoResult = await jitoResponse.json();
                    
                    if (jitoResult.error) {
                        lastError = jitoResult.error.message;
                        this.logger.error(`JITO bundle error: ${lastError}`);
                        
                        // If this is the last attempt, return error
                        if (attempt === MAX_RETRIES - 1) {
                            return { 
                                success: false, 
                                error: `JITO bundle failed after ${MAX_RETRIES} attempts: ${lastError}`,
                                signatures 
                            };
                        }
                        // Otherwise continue to the next retry attempt
                        continue;
                    }
                    
                    // Success - break out of retry loop
                    this.logger.info(`JITO bundle sent successfully: ${jitoResult.result}`);
                    
                    // Log transaction signatures
                    for (let i = 0; i < signatures.length; i++) {
                        this.logger.info(`Transaction ${i}: https://solscan.io/tx/${signatures[i]}`);
                    }
                    
                    return {
                        success: true,
                        signatures,
                        jitoResponse: jitoResult.result
                    };
                } catch (jitoError) {
                    lastError = jitoError.message;
                    this.logger.error(`JITO error attempt ${attempt + 1}: ${lastError}`);
                    
                    // If this is the last attempt, return error
                    if (attempt === MAX_RETRIES - 1) {
                        return { 
                            success: false, 
                            error: `JITO bundle failed after ${MAX_RETRIES} attempts: ${lastError}`,
                            signatures 
                        };
                    }
                    // Otherwise continue to the next retry attempt
                }
            }
            
            // If we get here, all retries failed (shouldn't normally reach here)
            return { 
                success: false, 
                error: `JITO bundle failed after ${MAX_RETRIES} attempts: ${lastError || 'Unknown error'}`,
                signatures 
            };
        } catch (error) {
            this.logger.error(`Bundled trade execution error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    
    // Execute a JITO-based market making strategy: 2x buys then 1 full sell
    async executeJitoMarketMaking(wallet, nextWallet) {
        try {
            // Make sure wallet is valid
            if (!wallet || !wallet.publicKey) {
                this.logger.error('Invalid wallet provided');
                return { success: false, error: 'Invalid wallet' };
            }

            this.logger.info(`Starting JITO market making with wallet: ${wallet.publicKey.toString()}`);
            
            // Get wallet balance first - handle RPC errors
            let walletBalance;
            try {
                walletBalance = await this.connection.getBalance(wallet.publicKey);
            } catch (balanceError) {
                this.logger.error(`Error fetching wallet balance: ${balanceError.message}`);
                // Try one more time with a delay
                await new Promise(resolve => setTimeout(resolve, 2000));
                try {
                    walletBalance = await this.connection.getBalance(wallet.publicKey);
                } catch (retryError) {
                    this.logger.error(`Retry failed, cannot get wallet balance: ${retryError.message}`);
                    return { success: false, error: 'Failed to get wallet balance' };
                }
            }

            // Safety check - if still no balance, fail gracefully
            if (walletBalance === undefined || walletBalance === null) {
                this.logger.error('Could not determine wallet balance');
                return { success: false, error: 'Could not determine wallet balance' };
            }
            
            const balanceInSOL = walletBalance / 1e9;
            this.logger.info(`Wallet balance: ${balanceInSOL} SOL (${walletBalance} lamports)`);
            
            // Reduced reserve for transaction fees by 10x
            const RESERVE_FOR_FEES = 0.0002 * 1e9; // Reduced from 0.002 to 0.0002 SOL
            const availableForTrading = Math.max(0, walletBalance - RESERVE_FOR_FEES);
            
            // Calculate amounts for buy operations using MAX_TRADE_AMOUNT
            const maxTradeAmount = typeof MAX_TRADE_AMOUNT === 'string' ? 
                parseFloat(MAX_TRADE_AMOUNT) || DEFAULT_MAX_TRADE : 
                (MAX_TRADE_AMOUNT || DEFAULT_MAX_TRADE);
            
            const buyAmount1 = maxTradeAmount; // First buy with MAX_TRADE_AMOUNT
            const buyAmount2 = maxTradeAmount; // Second buy with MAX_TRADE_AMOUNT
            
            this.logger.info(`Using ${buyAmount1} SOL for first buy and ${buyAmount2} SOL for second buy`);
            
            // Get trading pair
            const pair = this.activePairs[0];
            if (!pair) {
                this.logger.error('No active trading pair defined');
                return { success: false, error: 'No trading pair' };
            }
            
            // Prepare 2 buy operations and 1 sell operation as a bundle
            const bundleOperations = [
                {
                    action: 'buy',
                    mint: pair.token1.address,
                    denominatedInSol: 'true',
                    amount: buyAmount1.toString()  // First buy with MAX_TRADE_AMOUNT
                },
                {
                    action: 'buy',
                    mint: pair.token1.address,
                    denominatedInSol: 'true',
                    amount: buyAmount2.toString()  // Second buy with MAX_TRADE_AMOUNT
                },
                {
                    action: 'sell',
                    mint: pair.token1.address,
                    denominatedInSol: 'false',
                    amount: `100%`  // Sell all tokens
                }
            ];
            
            // Use the same wallet for all operations
            const bundleKeypairs = [wallet, wallet, wallet];
            
            this.logger.info(`Executing bundled 2:1 buy/sell cycle via JITO`);
            const bundleResponse = await this.executeBundledTrades(bundleOperations, bundleKeypairs);
            
            if (!bundleResponse.success) {
                this.logger.error(`Bundle execution failed: ${bundleResponse.error}`);
                return { success: false, error: bundleResponse.error };
            }
            
            this.logger.info(`Successfully executed 2:1 buy/sell cycle with signatures: ${bundleResponse.signatures.join(', ')}`);
            
            // If nextWallet is provided, transfer remaining SOL to it
            let transferSuccess = false;
            
            if (nextWallet && nextWallet.publicKey) {
                try {
                    this.logger.info(`Transferring remaining SOL to next wallet: ${nextWallet.publicKey.toString().substring(0, 8)}...`);
                    
                    // Reduce wait time from 10-15 seconds to 5-8 seconds
                    const transferWaitTime = 1000 + Math.floor(Math.random() * 3000);
                    this.logger.info(`Waiting ${transferWaitTime/1000} seconds before transfer...`);
                    await new Promise(resolve => setTimeout(resolve, transferWaitTime));
                    
                    // Get updated balance after trading
                    let remainingBalance;
                    try {
                        remainingBalance = await this.connection.getBalance(wallet.publicKey);
                        this.logger.info(`Remaining wallet balance after trading: ${remainingBalance / 1e9} SOL`);
                    } catch (balanceError) {
                        this.logger.error(`Error getting balance after trading: ${balanceError.message}`);
                        remainingBalance = 0;
                    }
                    
                    // Only attempt transfer if there's a meaningful balance
                    if (remainingBalance > 10000) { // More than 0.00001 SOL
                        // Transfer the remaining balance to next wallet
                        const transferResult = await this.transferSOL(wallet, nextWallet);
                        
                        if (transferResult) {
                            this.logger.info(`Successfully transferred SOL to next wallet`);
                            transferSuccess = true;
                        } else {
                            this.logger.error(`Failed to transfer SOL to next wallet`);
                            transferSuccess = false;
                        }
                    } else {
                        this.logger.warn(`Balance too low for transfer (${remainingBalance / 1e9} SOL), skipping`);
                        transferSuccess = false;
                    }
                } catch (transferError) {
                    this.logger.error(`Error transferring SOL to next wallet: ${transferError}`);
                    transferSuccess = false;
                }
            } else if (nextWallet) {
                this.logger.warn(`Next wallet is invalid or missing public key, skipping transfer`);
            }
            
            this.logger.info(`Market making cycle completed successfully with wallet ${wallet.publicKey.toString()}`);
            
            return { 
                success: true, 
                bundleResponse,
                tradingSuccess: true,
                transferSuccess
            };
            
        } catch (error) {
            this.logger.error(`JITO market making error: ${error.message}`);
            return { success: false, error: error.message, tradingSuccess: false, transferSuccess: false };
        }
    }
        
    // Transfer SOL to the next wallet in rotation with verification and retry
    async transferSOL(walletKeypair, nextWallet) {
        try {
            // Get balance of source wallet
            const initialSourceBalance = await this.connection.getBalance(walletKeypair.publicKey);
            const initialSourceBalanceSOL = initialSourceBalance / 1e9;
            
            console.log(`Initial source wallet balance: ${initialSourceBalanceSOL} SOL (${initialSourceBalance} lamports)`);
            
            // Reduced threshold by 10x
            if (initialSourceBalance <= 1000) { // Reduced from 5000 to 1000 lamports
                console.log(`Source balance too low to transfer: ${initialSourceBalanceSOL} SOL`);
                return false;
            }

            // Ensure nextWallet is a valid PublicKey object
            if (!nextWallet || !nextWallet.publicKey) {
                console.error('Invalid destination wallet');
                return false;
            }
            
            // Get initial balance of destination wallet for verification
            let initialDestBalance;
            try {
                initialDestBalance = await this.connection.getBalance(nextWallet.publicKey);
                console.log(`Initial destination wallet balance: ${initialDestBalance / 1e9} SOL`);
            } catch (err) {
                console.warn(`Could not get initial destination balance: ${err.message}`);
                initialDestBalance = 0;
            }
            
            const destinationPubkey = nextWallet.publicKey;
            console.log(`Transferring SOL balance to ${destinationPubkey.toString()}`);
            
            // Maximum retry attempts
            const MAX_RETRIES = 10;
            
            // Try the transfer up to MAX_RETRIES times
            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                if (attempt > 0) {
                    console.log(`Retry attempt ${attempt}/${MAX_RETRIES} for SOL transfer`);
                    
                    // Check source balance again before retry
                    const currentSourceBalance = await this.connection.getBalance(walletKeypair.publicKey);
                    if (currentSourceBalance <= 1000) {
                        console.log(`Source balance depleted, cannot retry: ${currentSourceBalance / 1e9} SOL`);
                        return false;
                    }
                }
                
                try {
                    // ALWAYS use the transfer-with-exact-fee approach
                    console.log(`Using fee-adjusted transfer approach...`);
                    
                    // Get a fresh blockhash
                    const { blockhash } = await this.connection.getLatestBlockhash({
                        commitment: 'finalized'
                    });
                    
                    // Create a minimal transaction
                    const transaction = new Transaction();
                    
                    // Reduced fee buffer by ~3x
                    const FEE_BUFFER = 5000; // 5000 lamport buffer
                    
                    // Get current source balance for this attempt
                    const sourceBalance = await this.connection.getBalance(walletKeypair.publicKey);
                    
                    // First, calculate how much we'd transfer if we reserved some for fees
                    const transferLamports = sourceBalance - FEE_BUFFER;
                    
                    if (transferLamports <= 0) {
                        console.log(`Balance (${sourceBalance} lamports) too small to transfer after fee buffer`);
                        return false;
                    }
                    
                    // Add transfer instruction with the fee-adjusted amount
                    transaction.add(
                        SystemProgram.transfer({
                            fromPubkey: walletKeypair.publicKey,
                            toPubkey: destinationPubkey,
                            lamports: transferLamports
                        })
                    );
                    
                    // Set blockhash
                    transaction.recentBlockhash = blockhash;
                    transaction.feePayer = walletKeypair.publicKey;
                    
                    // Sign transaction
                    transaction.sign(walletKeypair);
                    
                    // Send transaction with special options
                    console.log(`Sending SOL transfer of ${transferLamports} lamports (keeping ${FEE_BUFFER} for fees)...`);
                    const txid = await this.connection.sendRawTransaction(transaction.serialize(), {
                        skipPreflight: true, // Skip preflight for low balance transfers
                        maxRetries: 5
                    });
                    
                    // Simple confirmation loop to avoid complexity
                    console.log(`Transaction sent: ${txid}, waiting for confirmation...`);
                    
                    // Wait for confirmation
                    let confirmed = false;
                    for (let i = 0; i < 15; i++) {
                        try {
                            const { value: status } = await this.connection.getSignatureStatus(txid, {
                                searchTransactionHistory: true
                            });
                            
                            if (status && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) {
                                confirmed = true;
                                console.log(`Transaction confirmed with status: ${status.confirmationStatus}`);
                                break;
                            }
                            
                            if (status?.err) {
                                console.error(`Transaction failed: ${JSON.stringify(status.err)}`);
                                break;
                            }
                            
                            await sleep(2000); // Wait 2 seconds between checks
                        } catch (err) {
                            console.log(`Error checking confirmation: ${err.message}`);
                            await sleep(2000);
                        }
                    }
                    
                    // If transaction is confirmed, verify the destination got the funds
                    if (confirmed) {
                        console.log(`SOL transfer confirmed! Verifying destination balance...`);
                        
                        // Wait a bit for balance updates to propagate
                        await sleep(3000);
                        
                        // Verify destination balance increased
                        let finalDestBalance;
                        try {
                            finalDestBalance = await this.connection.getBalance(destinationPubkey);
                            console.log(`Final destination balance: ${finalDestBalance / 1e9} SOL`);
                            
                            // Verify balance increased by comparing with initial balance
                            if (finalDestBalance > initialDestBalance) {
                                console.log(`✅ Transfer verified! Destination balance increased by ${(finalDestBalance - initialDestBalance) / 1e9} SOL`);
                                return true;
                            } else {
                                console.warn(`⚠️ Destination balance did not increase despite confirmed transaction`);
                                // Continue to retry if more attempts are available
                            }
                        } catch (verifyErr) {
                            console.warn(`Could not verify destination balance: ${verifyErr.message}`);
                            
                            // Check source balance to see if funds were deducted
                            try {
                                const finalSourceBalance = await this.connection.getBalance(walletKeypair.publicKey);
                                if (finalSourceBalance < initialSourceBalance - 1500) {
                                    console.log(`Source balance decreased, assuming transfer was successful`);
                                    return true;
                                }
                            } catch (sourceCheckErr) {
                                console.warn(`Could not check source balance: ${sourceCheckErr.message}`);
                            }
                        }
                    }
                    
                    // If we get here, the transfer was not verified
                    console.warn(`Transfer not verified, ${MAX_RETRIES - attempt} retries left`);
                    
                    if (attempt < MAX_RETRIES) {
                        // Wait before retry
                        console.log(`Waiting 5 seconds before retry...`);
                        await sleep(5000);
                    }
                    
                } catch (attemptError) {
                    console.error(`Error in transfer attempt ${attempt + 1}: ${attemptError.message}`);
                    
                    if (attempt < MAX_RETRIES) {
                        // Wait before retry
                        console.log(`Waiting 5 seconds before retry...`);
                        await sleep(5000);
                    }
                }
            }
            
            // If we got here, all attempts failed
            console.error(`All ${MAX_RETRIES + 1} transfer attempts failed`);
            return false;
            
        } catch (error) {
            console.error(`SOL transfer failed:`, error.message);
            return false;
        }
    }

    // Execute trades across multiple wallets in sequence
    async executeMultipleWalletTrades(wallets) {
        try {
            if (!wallets || wallets.length === 0) {
                this.logger.error('No wallets provided for trading');
                return { success: false, error: 'No wallets provided' };
            }

            this.logger.info(`Starting market making sequence with ${wallets.length} wallets`);
            const results = [];

            // Process wallets sequentially to avoid rate limits
            for (let i = 0; i < wallets.length; i++) {
                const currentWallet = wallets[i];
                const nextWallet = i < wallets.length - 1 ? wallets[i + 1] : null;
                
                this.logger.info(`Processing wallet ${i + 1}/${wallets.length}: ${currentWallet.publicKey.toString()}`);
                
                // Use the market making function which now uses bundle transactions
                const result = await this.executeJitoMarketMaking(currentWallet, nextWallet);
                
                results.push({
                    wallet: currentWallet.publicKey.toString(),
                    success: result.success,
                    details: result
                });

                // Add a random delay between wallets to avoid rate limits (5-10 seconds)
                if (i < wallets.length - 1) {
                    const delayMs = 1000 + Math.floor(Math.random() * 5000);
                    this.logger.info(`Waiting ${delayMs/1000} seconds before processing next wallet...`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }

            const successCount = results.filter(r => r.success).length;
            this.logger.info(`Completed market making sequence. Success: ${successCount}/${wallets.length}`);
            
            return {
                success: true,
                walletResults: results,
                successCount,
                totalWallets: wallets.length
            };
        } catch (error) {
            this.logger.error(`Error in wallet sequence: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // Method to start the strategy (for compatibility)
    async runSolSpl(enableTrading = false) {
            try {
                // Initialize pairs if needed
                if (!this.activePairs.length) {
                    this.activePairs = [
                        { token0: this.solToken, token1: this.splToken, pool: 'auto' }
                    ];
                }
                
                // Simply emit the newToken event to trigger balance updates in index.js
                this.emit('newToken', {
                    token: this.activePairs[0].token1,
                    pair: this.activePairs[0]
                });
                
                return true;
            } catch (error) {
            this.logger.error('Error in runSolSpl:', error);
            return false;
        }
    }
}

module.exports = SolSpl;