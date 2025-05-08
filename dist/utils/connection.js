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
exports.executeRpcSafely = exports.getReliableConnection = exports.getConnectionPool = exports.getConnection = void 0;
const web3_js_1 = require("@solana/web3.js");
const chalk_1 = __importDefault(require("chalk"));
const dotenv = __importStar(require("dotenv"));
// Load environment variables
dotenv.config();
// Define backup RPC endpoints to use if the main one fails
const BACKUP_RPC_ENDPOINTS = [
    'https://api.mainnet-beta.solana.com', // Solana maintained (tends to have rate limits)
    'https://ssc-dao.genesysgo.net', // GenesysGo
    'https://solana-api.projectserum.com', // Project Serum
    'https://rpc.ankr.com/solana', // Ankr (may need API key for production)
    'https://mainnet.rpcpool.com', // RPCPool
];
// Keep track of rate limited endpoints to avoid retrying them immediately
let rateLimitedEndpoints = new Map();
// Keep track of last successful endpoint
let lastSuccessfulEndpoint = null;
// Create a connection to the Solana network
/**
 * Get a connection to the Solana blockchain
 *
 * This version supports fallback RPCs and rate limit handling
 *
 * @param endpoint Optional endpoint URL (will use env.SOLANA_RPC or fallbacks)
 * @param config Optional connection configuration
 * @returns Connection object
 */
function getConnection(endpoint, config) {
    const defaultConfig = {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000,
        disableRetryOnRateLimit: false,
    };
    const mergedConfig = { ...defaultConfig, ...config };
    // Use endpoint from parameter, or environment variable, or default to a public endpoint
    const primaryEndpoint = endpoint || process.env.SOLANA_RPC || BACKUP_RPC_ENDPOINTS[0];
    // If we previously had a successful connection, try to use that endpoint first
    const initialEndpoint = lastSuccessfulEndpoint || primaryEndpoint;
    console.log(chalk_1.default.blue(`Connecting to Solana via ${hideApiKey(initialEndpoint)}`));
    // Create a connection with special rate limit handling
    const connection = new web3_js_1.Connection(initialEndpoint, mergedConfig);
    // Set up a periodic health check to report RPC status
    setupPeriodicHealthCheck(connection);
    // Wrap key methods with rate limit handling and automatic endpoint rotation
    const originalGetVersion = connection.getVersion.bind(connection);
    connection.getVersion = async () => {
        return executeWithFallback(originalGetVersion, 'getVersion', connection);
    };
    const originalGetLatestBlockhash = connection.getLatestBlockhash.bind(connection);
    connection.getLatestBlockhash = async (commitmentOrConfig) => {
        return executeWithFallback(() => originalGetLatestBlockhash(commitmentOrConfig), 'getLatestBlockhash', connection);
    };
    const originalGetParsedTransaction = connection.getParsedTransaction.bind(connection);
    connection.getParsedTransaction = async (signature, commitmentOrConfig) => {
        return executeWithFallback(() => originalGetParsedTransaction(signature, commitmentOrConfig), 'getParsedTransaction', connection);
    };
    // Override onLogs to handle rate limiting gracefully
    const originalOnLogs = connection.onLogs.bind(connection);
    connection.onLogs = (publicKey, callback, commitment) => {
        // Create a wrapped callback that handles errors
        const wrappedCallback = (logs, ctx) => {
            // If there's an error in the logs callback, try to recover
            if (logs.err && isRateLimitError(logs.err)) {
                console.log(chalk_1.default.yellow(`RPC endpoint ${hideApiKey(getCurrentEndpoint(connection))} rate limited onLogs. Trying another endpoint...`));
                // Mark this endpoint as rate limited
                rateLimitedEndpoints.set(getCurrentEndpoint(connection), Date.now() + 30000);
                // Find a new endpoint
                const newEndpoint = findBestEndpoint(getCurrentEndpoint(connection));
                if (newEndpoint && newEndpoint !== getCurrentEndpoint(connection)) {
                    console.log(chalk_1.default.blue(`Switching to RPC endpoint: ${hideApiKey(newEndpoint)}`));
                    try {
                        // First try to remove the current listener
                        try {
                            // The logs.subscription should contain the subscription id
                            if (logs.subscription) {
                                connection.removeOnLogsListener(logs.subscription);
                            }
                        }
                        catch (e) {
                            // Ignore errors from removing listener
                            console.log(chalk_1.default.gray(`Error removing log listener: ${e.message}`));
                        }
                        // Update the connection endpoint
                        updateConnectionEndpoint(connection, newEndpoint);
                        // Set up a new listener after a short delay
                        setTimeout(() => {
                            try {
                                // Pass the wrapped callback back to avoid potential infinite loops
                                // and maintain same parameters as the original call
                                const newSub = originalOnLogs(publicKey, wrappedCallback, commitment);
                                console.log(chalk_1.default.green(`Successfully reconnected onLogs listener with new endpoint`));
                            }
                            catch (e) {
                                console.log(chalk_1.default.red(`Failed to reconnect onLogs listener: ${e.message}`));
                            }
                        }, 1000);
                        return;
                    }
                    catch (e) {
                        console.log(chalk_1.default.red(`Error while switching endpoints: ${e.message}`));
                    }
                }
            }
            // Pass through to the original callback
            callback(logs, ctx);
        };
        // Call the original onLogs with our wrapped callback
        try {
            return originalOnLogs(publicKey, wrappedCallback, commitment);
        }
        catch (error) {
            console.log(chalk_1.default.red(`Error setting up onLogs: ${error.message}`));
            throw error;
        }
    };
    return connection;
}
exports.getConnection = getConnection;
/**
 * Set up a periodic health check for the RPC connection
 * This helps diagnose issues and ensures we're using reliable endpoints
 */
function setupPeriodicHealthCheck(connection) {
    // Keep track of successes and failures
    let successCount = 0;
    let failureCount = 0;
    // Setup the interval (every 5 minutes)
    const healthCheckInterval = setInterval(async () => {
        try {
            // Get current endpoint
            const currentEndpoint = getCurrentEndpoint(connection);
            // Check if we have any rate-limited endpoints
            const rateLimitedCount = rateLimitedEndpoints.size;
            // Only log health info if we've had issues
            if (failureCount > 0 || rateLimitedCount > 0) {
                console.log(chalk_1.default.cyan(`=== RPC Health Status ===`));
                console.log(chalk_1.default.blue(`Current endpoint: ${hideApiKey(currentEndpoint)}`));
                console.log(chalk_1.default.blue(`Rate-limited endpoints: ${rateLimitedCount}`));
                console.log(chalk_1.default.blue(`Success/Failure ratio: ${successCount}/${failureCount}`));
                console.log(chalk_1.default.cyan(`========================`));
                // Reset counters
                successCount = 0;
                failureCount = 0;
            }
            // Also clean up old rate-limited endpoints that have cooled down
            const now = Date.now();
            for (const [endpoint, expiry] of rateLimitedEndpoints.entries()) {
                if (expiry < now) {
                    console.log(chalk_1.default.green(`Endpoint ${hideApiKey(endpoint)} has cooled down and is available again`));
                    rateLimitedEndpoints.delete(endpoint);
                }
            }
        }
        catch (error) {
            // Ignore errors in the health check
        }
    }, 5 * 60 * 1000); // Every 5 minutes
    // Ensure this doesn't keep the process alive
    healthCheckInterval.unref();
}
/**
 * Hide API keys in endpoint URLs for logging purposes
 */
function hideApiKey(url) {
    try {
        // Match common API key patterns in URLs
        return url.replace(/(\?|&)api[-_]?key=([^&]+)/gi, '$1api-key=****')
            .replace(/(\?|&)access[-_]?key=([^&]+)/gi, '$1access-key=****');
    }
    catch (e) {
        return url;
    }
}
/**
 * Execute a function with automatic fallback to other RPC endpoints if it fails
 */
async function executeWithFallback(fn, methodName, connection, maxRetries = 3) {
    let currentEndpoint = getCurrentEndpoint(connection);
    let attempt = 0;
    let lastError = null;
    while (attempt < maxRetries) {
        try {
            // Try to execute the function
            const result = await fn();
            // If successful, remember this endpoint
            lastSuccessfulEndpoint = currentEndpoint;
            // Track success for health reporting
            if (typeof global.connectionSuccessCount === 'undefined') {
                global.connectionSuccessCount = 0;
            }
            global.connectionSuccessCount++;
            return result;
        }
        catch (error) {
            lastError = error;
            attempt++;
            // Track failure for health reporting
            if (typeof global.connectionFailureCount === 'undefined') {
                global.connectionFailureCount = 0;
            }
            global.connectionFailureCount++;
            // Check if this was a rate limit error
            if (isRateLimitError(error)) {
                console.log(chalk_1.default.yellow(`RPC endpoint ${hideApiKey(currentEndpoint)} rate limited (${methodName}). Trying another endpoint...`));
                // Mark this endpoint as rate limited
                rateLimitedEndpoints.set(currentEndpoint, Date.now() + 30000); // Cool down for 30 seconds
                // Switch to another endpoint
                const newEndpoint = findBestEndpoint(currentEndpoint);
                if (newEndpoint && newEndpoint !== currentEndpoint) {
                    currentEndpoint = newEndpoint;
                    updateConnectionEndpoint(connection, newEndpoint);
                    console.log(chalk_1.default.blue(`Switched to RPC endpoint: ${hideApiKey(newEndpoint)}`));
                    // Reset attempt counter since we're trying a new endpoint
                    attempt = 0;
                    continue;
                }
            }
            if (attempt < maxRetries) {
                // Exponential backoff before retrying
                const backoff = Math.min(1000 * Math.pow(2, attempt), 10000);
                console.log(chalk_1.default.yellow(`${methodName} failed, retrying in ${backoff / 1000}s... (${attempt}/${maxRetries})`));
                await new Promise(resolve => setTimeout(resolve, backoff));
            }
        }
    }
    // If we've exhausted all retries, throw the last error
    throw lastError || new Error(`Failed to execute ${methodName} after ${maxRetries} attempts`);
}
/**
 * Check if an error is a rate limit error
 */
function isRateLimitError(error) {
    const errorMessage = error?.message || '';
    if (!errorMessage) {
        // Try to convert the error to a string and check
        const errorString = error?.toString?.() || '';
        return errorString.includes('429') ||
            errorString.toLowerCase().includes('rate limit') ||
            errorString.toLowerCase().includes('too many requests');
    }
    return errorMessage.includes('429') ||
        errorMessage.toLowerCase().includes('rate limit') ||
        errorMessage.toLowerCase().includes('too many requests');
}
/**
 * Get current RPC endpoint from connection object
 */
function getCurrentEndpoint(connection) {
    // The endpoint is stored in the connection object but may not be directly accessible
    // Try to extract it safely
    return connection._rpcEndpoint || connection.rpcEndpoint || BACKUP_RPC_ENDPOINTS[0];
}
/**
 * Update the connection's endpoint
 */
function updateConnectionEndpoint(connection, newEndpoint) {
    try {
        // This is a bit of a hack since Connection doesn't expose a way to change endpoints
        // We're directly modifying the internal _rpcEndpoint property
        connection._rpcEndpoint = newEndpoint;
        connection._rpcClient = null; // Force recreation of the client
        connection._rpcRequest = null;
    }
    catch (e) {
        console.log(chalk_1.default.red('Failed to update connection endpoint'));
    }
}
/**
 * Find the best available RPC endpoint
 */
function findBestEndpoint(currentEndpoint) {
    // Start with user's configured endpoint from env
    const possibleEndpoints = [
        process.env.SOLANA_RPC,
        ...BACKUP_RPC_ENDPOINTS
    ].filter(Boolean);
    // Filter out the current endpoint and any that are currently rate limited
    const now = Date.now();
    const availableEndpoints = possibleEndpoints.filter(endpoint => {
        // Skip current endpoint
        if (endpoint === currentEndpoint)
            return false;
        // Skip rate limited endpoints that haven't cooled down
        const limitedUntil = rateLimitedEndpoints.get(endpoint);
        if (limitedUntil && limitedUntil > now)
            return false;
        return true;
    });
    // If we have a last successful endpoint that's not the current one and not rate limited, use it
    if (lastSuccessfulEndpoint &&
        lastSuccessfulEndpoint !== currentEndpoint &&
        availableEndpoints.includes(lastSuccessfulEndpoint)) {
        console.log(chalk_1.default.green(`Reusing previously successful endpoint: ${hideApiKey(lastSuccessfulEndpoint)}`));
        return lastSuccessfulEndpoint;
    }
    // Otherwise pick randomly from available endpoints to distribute load
    if (availableEndpoints.length > 0) {
        const selectedEndpoint = availableEndpoints[Math.floor(Math.random() * availableEndpoints.length)];
        console.log(chalk_1.default.green(`Selected new endpoint from ${availableEndpoints.length} available: ${hideApiKey(selectedEndpoint)}`));
        return selectedEndpoint;
    }
    // If all are rate limited, pick the one with the earliest expiry
    let earliestExpiry = Infinity;
    let bestEndpoint = currentEndpoint;
    for (const [endpoint, expiry] of rateLimitedEndpoints.entries()) {
        if (expiry < earliestExpiry && endpoint !== currentEndpoint) {
            earliestExpiry = expiry;
            bestEndpoint = endpoint;
        }
    }
    // If we found one with an earlier expiry, return it
    if (bestEndpoint !== currentEndpoint) {
        const waitTime = Math.max(0, Math.ceil((earliestExpiry - now) / 1000));
        console.log(chalk_1.default.yellow(`All endpoints are rate-limited. Using ${hideApiKey(bestEndpoint)} which will be available in ${waitTime}s`));
        return bestEndpoint;
    }
    // As a last resort, return the primary endpoint from env or first backup
    console.log(chalk_1.default.yellow(`Falling back to primary endpoint as last resort`));
    return process.env.SOLANA_RPC || BACKUP_RPC_ENDPOINTS[0];
}
/**
 * Get multiple connection instances for load balancing
 */
function getConnectionPool(rpcEndpoints) {
    // If no endpoints provided, use the environment variables
    const endpoints = rpcEndpoints || [
        process.env.SOLANA_RPC,
        process.env.SOLANA_RPC_2
    ].filter(Boolean);
    // Ensure we have at least one endpoint
    if (endpoints.length === 0) {
        endpoints.push('https://api.mainnet-beta.solana.com');
    }
    // Create connections for each endpoint
    return endpoints.map(endpoint => new web3_js_1.Connection(endpoint, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 180000,
        disableRetryOnRateLimit: false
    }));
}
exports.getConnectionPool = getConnectionPool;
/**
 * Get a reliable connection for transactions
 */
function getReliableConnection() {
    // Use a known reliable RPC endpoint for critical operations
    const RELIABLE_RPC = process.env.SOLANA_RPC;
    return new web3_js_1.Connection('https://api.mainnet-beta.solana.com', {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 180000,
        disableRetryOnRateLimit: false
    });
}
exports.getReliableConnection = getReliableConnection;
/**
 * Execute or retry an RPC call without terminating the program (for streaming calls)
 * This version is more forgiving and won't throw exceptions that could terminate the program
 */
async function executeRpcSafely(fn, methodName, connection) {
    try {
        // Try with fallback
        const result = await executeWithFallback(fn, methodName, connection, 5);
        return { success: true, result };
    }
    catch (error) {
        console.log(chalk_1.default.red(`All RPC endpoints failed for operation: ${methodName}`));
        console.log(chalk_1.default.yellow(`Will automatically retry in 10 seconds...`));
        // Instead of failing completely, wait and try again later
        try {
            await new Promise(resolve => setTimeout(resolve, 10000));
            // After waiting, try to cycle to a fresh endpoint
            const endpoints = [
                process.env.SOLANA_RPC,
                ...BACKUP_RPC_ENDPOINTS
            ].filter(Boolean);
            if (endpoints.length > 0) {
                const randomEndpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
                console.log(chalk_1.default.blue(`Trying fresh endpoint: ${hideApiKey(randomEndpoint)}`));
                updateConnectionEndpoint(connection, randomEndpoint);
            }
            return { success: false, error };
        }
        catch (e) {
            return { success: false, error };
        }
    }
}
exports.executeRpcSafely = executeRpcSafely;
