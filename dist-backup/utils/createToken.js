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
exports.createToken = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const wallet_1 = require("./wallet");
const logger_1 = __importDefault(require("./logger"));
const PumpFunWrapper_1 = require("./PumpFunWrapper");
const proxyManager_1 = require("./proxyManager");
const chalk_1 = __importDefault(require("chalk"));
// Sleep function to add delay if needed
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
/**
 * Upload token logo to IPFS through pump.fun
 * @param authToken Auth token for pump.fun
 * @param logoPath Path to logo file
 * @param useProxy Whether to use proxy for the upload
 * @param sessionId Optional session ID for consistent proxy usage
 * @returns IPFS URL if successful, or null if failed
 */
async function uploadLogo(authToken, logoPath, useProxy = false, sessionId) {
    try {
        // Check if file exists
        if (!fs.existsSync(logoPath)) {
            throw new Error(`Logo file not found: ${logoPath}`);
        }
        const fileData = fs.readFileSync(logoPath);
        const filename = path.basename(logoPath);
        const PUMP_FUN_API_URL = "https://pump.fun/api/ipfs";
        const formData = new form_data_1.default();
        formData.append("file", fileData, filename);
        const headers = {
            accept: "*/*",
            "accept-language": "en-US,en;q=0.9",
            origin: "https://pump.fun",
            referer: "https://pump.fun/create",
            "sec-ch-ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"macOS"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        };
        if (authToken) {
            headers.Cookie = `auth_token=${authToken}`;
        }
        const requestConfig = {
            headers: {
                ...headers,
                ...formData.getHeaders(),
            }
        };
        // Add proxy configuration if enabled
        if (useProxy) {
            const proxyManager = (0, proxyManager_1.getProxyManager)();
            if (proxyManager.isEnabled()) {
                console.log(chalk_1.default.cyan(`Using proxy for logo upload ${sessionId ? `(session: ${sessionId})` : ''}`));
                const proxyConfig = proxyManager.getAxiosConfig(undefined, undefined, sessionId);
                if (proxyConfig.httpsAgent) {
                    requestConfig.httpsAgent = proxyConfig.httpsAgent;
                    requestConfig.httpAgent = proxyConfig.httpsAgent;
                }
            }
            else {
                console.log(chalk_1.default.yellow("Proxy requested but not enabled. Using direct connection for logo upload."));
            }
        }
        console.log(chalk_1.default.blue(`Uploading logo to IPFS...`));
        const response = await axios_1.default.post(PUMP_FUN_API_URL, formData, requestConfig);
        if (response.data && response.data.metadata && response.data.metadata.image) {
            console.log(chalk_1.default.green(`Logo uploaded successfully: ${response.data.metadata.image}`));
            return response.data.metadata.image;
        }
        else {
            console.log(chalk_1.default.red(`Failed to upload logo: no image URL in response`));
            return null;
        }
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error uploading logo: ${error.message}`));
        logger_1.default.error('Logo upload error', error);
        return null;
    }
}
/**
 * Create token on pump.fun
 * @param options Token creation options
 * @returns Result object with success status and mint address or error
 */
async function createToken(options) {
    try {
        // Load wallets from default location
        const projectRootDir = path.resolve(__dirname, '../../');
        const configDir = path.join(projectRootDir, '.config');
        const walletPath = path.join(configDir, 'wallets.json');
        // Load wallets
        const wallets = (0, wallet_1.loadWallets)(walletPath);
        if (wallets.length < options.creatorWalletIndex + 1) {
            throw new Error(`Creator wallet index ${options.creatorWalletIndex} out of bounds (${wallets.length} wallets available)`);
        }
        const creatorWallet = wallets[options.creatorWalletIndex];
        console.log(chalk_1.default.cyan(`Using creator wallet: ${creatorWallet.publicKey}`));
        // Check if proxy support is enabled
        const useProxy = options.useProxy !== undefined ? options.useProxy :
            (process.env.USE_PROXIES === 'true' || false);
        // Create a consistent proxy session ID for this wallet
        const sessionId = `token-${creatorWallet.publicKey.substring(0, 8)}`;
        // Test proxy if enabled
        if (useProxy) {
            const proxyManager = (0, proxyManager_1.getProxyManager)();
            if (proxyManager.isEnabled()) {
                console.log(chalk_1.default.cyan('Proxy support is enabled for token creation'));
                const testResult = await proxyManager.testProxy();
                if (testResult.success) {
                    console.log(chalk_1.default.green(`Proxy connection successful: ${testResult.ip} (${testResult.message})`));
                }
                else {
                    console.log(chalk_1.default.yellow(`Proxy test failed: ${testResult.message}. Will try to proceed anyway.`));
                }
            }
            else {
                console.log(chalk_1.default.yellow('Proxies requested but none configured. Continuing without proxy.'));
            }
        }
        // Step 1: Authenticate with pump.fun
        console.log(chalk_1.default.cyan('Authenticating with pump.fun...'));
        const authResult = await (0, PumpFunWrapper_1.enhancedAuthenticate)(creatorWallet, useProxy ? { useProxy, sessionId } : undefined);
        if (!authResult) {
            throw new Error('Failed to authenticate with pump.fun');
        }
        console.log(chalk_1.default.green('Authentication successful'));
        // Step 2: Upload logo to IPFS
        const logoUrl = await uploadLogo(authResult.authToken, options.logoPath, useProxy, sessionId);
        if (!logoUrl) {
            throw new Error('Failed to upload logo');
        }
        // Step 3: Create token via the API
        console.log(chalk_1.default.cyan('Creating token...'));
        // Set up API client with optional proxy
        let clientConfig = {
            headers: {
                "Content-Type": "application/json",
                "Accept": "*/*",
                "Origin": "https://pump.fun",
                "Referer": "https://pump.fun/create",
                "Cookie": `auth_token=${authResult.authToken}`,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
            },
            timeout: 60000 // 60 second timeout for token creation
        };
        // Add proxy configuration if enabled
        if (useProxy) {
            const proxyManager = (0, proxyManager_1.getProxyManager)();
            if (proxyManager.isEnabled()) {
                // Apply proxy configuration to axios
                const proxyConfig = proxyManager.getAxiosConfig(undefined, undefined, sessionId);
                clientConfig = { ...clientConfig, ...proxyConfig };
                console.log(chalk_1.default.cyan('Using proxy for token creation API call'));
            }
        }
        const client = axios_1.default.create(clientConfig);
        // Prepare token data
        const tokenData = {
            token_name: options.tokenName,
            token_symbol: options.tokenSymbol,
            banner_url: null, // Banner is optional
            deployment_cost: 0.01, // Default deployment cost
            description: options.description,
            image_url: logoUrl,
            links: {},
            publicKey: creatorWallet.publicKey
        };
        // Add optional social links if provided
        if (options.twitter) {
            tokenData.links['twitter'] = options.twitter;
        }
        if (options.telegram) {
            tokenData.links['telegram'] = options.telegram;
        }
        if (options.website) {
            tokenData.links['website'] = options.website;
        }
        // Create token
        const tokenResponse = await client.post('https://frontend-api-v3.pump.fun/tokens', tokenData);
        if (!tokenResponse.data || !tokenResponse.data.token_mint) {
            throw new Error('Failed to create token: Invalid response from API');
        }
        const mintAddress = tokenResponse.data.token_mint;
        console.log(chalk_1.default.green(`Token created successfully! Mint address: ${mintAddress}`));
        // Step 4: Perform initial buys if requested
        if (options.initialBuys > 0) {
            const initialBuyWallets = wallets.filter((_, idx) => idx !== options.creatorWalletIndex)
                .slice(0, options.initialBuys);
            console.log(chalk_1.default.cyan(`Performing ${initialBuyWallets.length} initial buys...`));
            for (let i = 0; i < initialBuyWallets.length; i++) {
                const buyWallet = initialBuyWallets[i];
                const buyerId = `buyer-${buyWallet.publicKey.substring(0, 8)}`;
                console.log(chalk_1.default.cyan(`Performing buy #${i + 1} with wallet ${buyWallet.publicKey.substring(0, 8)}...`));
                try {
                    // Authenticate buyer wallet with pump.fun
                    const buyerAuth = await (0, PumpFunWrapper_1.enhancedAuthenticate)(buyWallet, useProxy ? { useProxy, sessionId: buyerId } : undefined);
                    if (!buyerAuth) {
                        console.log(chalk_1.default.yellow(`Failed to authenticate buyer wallet ${i + 1}, skipping this buy`));
                        continue;
                    }
                    // Set up buyer API client with optional proxy
                    let buyerConfig = {
                        headers: {
                            "Content-Type": "application/json",
                            "Accept": "*/*",
                            "Origin": "https://pump.fun",
                            "Referer": `https://pump.fun/token/${mintAddress}`,
                            "Cookie": `auth_token=${buyerAuth.authToken}`,
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
                        },
                        timeout: 30000
                    };
                    // Add proxy configuration for buyer if enabled
                    if (useProxy) {
                        const proxyManager = (0, proxyManager_1.getProxyManager)();
                        if (proxyManager.isEnabled()) {
                            // Use a different country for each buyer for variety
                            const countries = ['US', 'CA', 'GB', 'DE', 'FR', 'AU'];
                            const randomCountry = countries[i % countries.length];
                            // Apply proxy configuration to axios
                            const proxyConfig = proxyManager.getAxiosConfig(randomCountry, undefined, buyerId);
                            buyerConfig = { ...buyerConfig, ...proxyConfig };
                            console.log(chalk_1.default.cyan(`Using proxy for buy #${i + 1} (${randomCountry})`));
                        }
                    }
                    const buyerClient = axios_1.default.create(buyerConfig);
                    // Calculate random buy amount between 0.01 and 0.05 SOL
                    const buyAmount = (Math.random() * 0.04 + 0.01).toFixed(4);
                    // Perform buy transaction
                    const buyData = {
                        token_mint: mintAddress,
                        amount: buyAmount
                    };
                    const buyResponse = await buyerClient.post('https://frontend-api-v3.pump.fun/trades/buy', buyData);
                    if (buyResponse.status >= 200 && buyResponse.status < 300) {
                        console.log(chalk_1.default.green(`Buy #${i + 1} successful: ${buyAmount} SOL`));
                    }
                    else {
                        console.log(chalk_1.default.yellow(`Buy #${i + 1} returned unexpected status: ${buyResponse.status}`));
                    }
                    // Add random delay between buys
                    if (i < initialBuyWallets.length - 1) {
                        const delay = Math.floor(Math.random() * 5000) + 5000; // 5-10 seconds
                        console.log(chalk_1.default.gray(`Waiting ${Math.round(delay / 1000)} seconds before next buy...`));
                        await sleep(delay);
                    }
                }
                catch (buyError) {
                    console.log(chalk_1.default.yellow(`Error performing buy #${i + 1}: ${buyError.message}`));
                    logger_1.default.error(`Buy error for wallet ${i + 1}`, buyError);
                }
            }
        }
        return {
            success: true,
            mintAddress
        };
    }
    catch (error) {
        console.error(chalk_1.default.red(`Token creation failed: ${error.message}`));
        logger_1.default.error('Token creation error', error);
        return {
            success: false,
            error: error.message
        };
    }
}
exports.createToken = createToken;
