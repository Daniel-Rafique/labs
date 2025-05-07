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
exports.postReplyCommand = void 0;
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const axios_1 = __importDefault(require("axios"));
const path = __importStar(require("path"));
const wallet_1 = require("../utils/wallet");
const transaction_1 = require("../utils/transaction");
// Import OpenAI SDK using v4 syntax
const openai_1 = __importDefault(require("openai"));
const dotenv = __importStar(require("dotenv"));
const fs = __importStar(require("fs"));
const bs58 = __importStar(require("bs58"));
const nacl = __importStar(require("tweetnacl"));
// Import proxy agents for proxy support
const https_proxy_agent_1 = require("https-proxy-agent");
const socks_proxy_agent_1 = require("socks-proxy-agent");
// Import our wrapper for enhanced implementation
const PumpFunWrapper_1 = require("../utils/PumpFunWrapper");
// Load environment variables
dotenv.config();
/**
 * Saves the OpenAI API key to the .env file
 * @param apiKey The OpenAI API key to save
 */
async function saveApiKeyToEnv(apiKey) {
    try {
        // Get project root directory
        const projectRootDir = path.resolve(__dirname, '../../');
        const envPath = path.join(projectRootDir, '.env');
        let envContent = '';
        // Read existing .env file if it exists
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }
        // Check if OPENAI_API_KEY already exists in the file
        const openAiKeyRegex = /^OPENAI_API_KEY=.*/m;
        if (openAiKeyRegex.test(envContent)) {
            // Replace existing OPENAI_API_KEY
            envContent = envContent.replace(openAiKeyRegex, `OPENAI_API_KEY=${apiKey}`);
        }
        else {
            // Add OPENAI_API_KEY if it doesn't exist
            if (envContent && !envContent.endsWith('\n')) {
                envContent += '\n';
            }
            envContent += `OPENAI_API_KEY=${apiKey}\n`;
        }
        // Write updated content back to .env file
        fs.writeFileSync(envPath, envContent);
    }
    catch (error) {
        console.error(`Error saving API key to .env file: ${error.message}`);
        throw error;
    }
}
async function postReplyCommand(options) {
    try {
        // Get options interactively if not provided
        let { path: walletPath, tokenMint, comment, useAi, randomize, shillMode, preferredMethod, likeMode, likeCount } = options;
        // Force proxy option to be false regardless of input
        const useProxies = false;
        if (!walletPath) {
            // Get project root directory
            const projectRootDir = path.resolve(__dirname, '../../');
            const configDir = path.join(projectRootDir, '.config');
            // Use wallets.json by default
            walletPath = path.join(configDir, 'wallets.json');
        }
        // Load wallets
        console.log(chalk_1.default.cyan(`Loading wallets from: ${walletPath}`));
        const wallets = (0, wallet_1.loadWallets)(walletPath);
        console.log(chalk_1.default.green(`Loaded ${wallets.length} wallets`));
        // Always use browser method, no need to ask
        preferredMethod = 'browser';
        console.log(chalk_1.default.green('✓ Using direct connection for optimal reliability'));
        // Empty proxies data to ensure we never use proxies
        let proxiesData = [];
        // Get token mint if not provided - check env variables first
        if (!tokenMint) {
            // Check if CONTRACT_ADDRESS or PUMP_MINT is set in environment
            if (process.env.CONTRACT_ADDRESS) {
                tokenMint = process.env.CONTRACT_ADDRESS;
                console.log(chalk_1.default.cyan(`Using token mint from CONTRACT_ADDRESS: ${tokenMint}`));
            }
            else if (process.env.PUMP_MINT) {
                tokenMint = process.env.PUMP_MINT;
                console.log(chalk_1.default.cyan(`Using token mint from PUMP_MINT: ${tokenMint}`));
            }
            else {
                const tokenMintAnswer = await inquirer_1.default.prompt([
                    {
                        type: 'input',
                        name: 'tokenMint',
                        message: 'Enter the token mint address:',
                        validate: (input) => {
                            if (!input)
                                return 'Token mint address is required';
                            return true;
                        }
                    }
                ]);
                tokenMint = tokenMintAnswer.tokenMint;
            }
        }
        // Determine if using AI for comments
        if (useAi === undefined) {
            const useAiAnswer = await inquirer_1.default.prompt([
                {
                    type: 'confirm',
                    name: 'useAi',
                    message: 'Use AI to generate comments?',
                    default: false
                }
            ]);
            useAi = useAiAnswer.useAi;
        }
        // We don't need API key for posting comments directly to contract
        const apiKey = "";
        // If using AI, check for OpenAI key
        let openaiKey;
        if (useAi) {
            // Check environment variables - try both names for backward compatibility
            openaiKey = process.env.OPENAI_API_KEY;
            if (!openaiKey) {
                const openaiKeyAnswer = await inquirer_1.default.prompt([
                    {
                        type: 'input',
                        name: 'openaiKey',
                        message: 'Enter your OpenAI API key:',
                        validate: (input) => {
                            if (!input)
                                return 'OpenAI API key is required for AI comments';
                            return true;
                        }
                    },
                    {
                        type: 'confirm',
                        name: 'saveKey',
                        message: 'Would you like to save this API key to your .env file for future use?',
                        default: true
                    }
                ]);
                openaiKey = openaiKeyAnswer.openaiKey;
                // Save the API key to .env file if requested
                if (openaiKeyAnswer.saveKey && openaiKey) {
                    try {
                        await saveApiKeyToEnv(openaiKey);
                        console.log(chalk_1.default.green('✓ OpenAI API key saved to .env file'));
                    }
                    catch (error) {
                        console.warn(chalk_1.default.yellow(`Could not save API key to .env file: ${error.message}`));
                    }
                }
            }
            else {
                console.log(chalk_1.default.green('Using OpenAI API key from environment variables.'));
            }
        }
        // If not using AI, get a custom comment or use randomized positive comments
        if (!useAi) {
            if (randomize === undefined) {
                const randomizeAnswer = await inquirer_1.default.prompt([
                    {
                        type: 'list',
                        name: 'commentSource',
                        message: 'How do you want to generate comments?',
                        choices: [
                            { name: 'Use random positive comments from predefined list', value: 'random' },
                            { name: 'Use comments from comments.txt file', value: 'file' },
                            { name: 'Use a single custom comment', value: 'custom' }
                        ],
                        default: 'file'
                    }
                ]);
                randomize = randomizeAnswer.commentSource === 'random' || randomizeAnswer.commentSource === 'file';
                // Load comments if using file
                if (randomizeAnswer.commentSource === 'file') {
                    await loadComments();
                }
            }
            if (!randomize && !comment) {
                const commentAnswer = await inquirer_1.default.prompt([
                    {
                        type: 'input',
                        name: 'comment',
                        message: 'Enter a custom comment:',
                        default: 'Great token! 🚀'
                    }
                ]);
                comment = commentAnswer.comment;
            }
        }
        // Ask about liking comments if not specified
        if (likeMode === undefined) {
            const likeModeAnswer = await inquirer_1.default.prompt([
                {
                    type: 'confirm',
                    name: 'likeMode',
                    message: 'Like comments/replies on this token?',
                    default: false
                }
            ]);
            likeMode = likeModeAnswer.likeMode;
            // If liking is enabled, ask how many comments to like
            if (likeMode) {
                const likeCountAnswer = await inquirer_1.default.prompt([
                    {
                        type: 'list',
                        name: 'likeOption',
                        message: 'How many comments would you like to like?',
                        choices: [
                            { name: 'Like all comments', value: 'all' },
                            { name: 'Like top 10 comments', value: '10' },
                            { name: 'Like top 20 comments', value: '20' },
                            { name: 'Like top 50 comments', value: '50' },
                            { name: 'Custom number', value: 'custom' }
                        ],
                        default: 'all'
                    }
                ]);
                if (likeCountAnswer.likeOption === 'custom') {
                    const customCountAnswer = await inquirer_1.default.prompt([
                        {
                            type: 'number',
                            name: 'customCount',
                            message: 'Enter number of comments to like:',
                            default: 5,
                            validate: (input) => {
                                if (isNaN(input) || input < 0)
                                    return 'Please enter a valid number (0 for all)';
                                return true;
                            }
                        }
                    ]);
                    likeCount = customCountAnswer.customCount;
                }
                else if (likeCountAnswer.likeOption === 'all') {
                    likeCount = 0; // 0 means all
                }
                else {
                    likeCount = parseInt(likeCountAnswer.likeOption);
                }
            }
        }
        // Get number of comments to post per wallet
        const commentsPerWalletAnswer = await inquirer_1.default.prompt([
            {
                type: 'number',
                name: 'commentsPerWallet',
                message: 'How many comments to post per wallet?',
                default: 1,
                validate: (input) => {
                    if (isNaN(input) || input < 1)
                        return 'Must be a positive number';
                    return true;
                }
            }
        ]);
        const commentsPerWallet = commentsPerWalletAnswer.commentsPerWallet;
        // Load comments from file if using randomize from file
        const predefinedComments = await loadComments();
        // Post replies - ensure tokenMint is not undefined
        if (!tokenMint) {
            throw new Error('Token mint address is required');
        }
        await postReplies(wallets, tokenMint, apiKey, {
            useAi: useAi || false,
            randomize: randomize || false,
            openaiKey,
            customComment: comment,
            commentsPerWallet,
            proxies: proxiesData,
            predefinedComments,
            preferredMethod: preferredMethod,
            likeMode: likeMode || false,
            likeCount: likeCount,
            withImage: options.withImage
        });
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error posting replies: ${error.message}`));
        if (error.stack) {
            console.debug(chalk_1.default.gray(error.stack));
        }
    }
}
exports.postReplyCommand = postReplyCommand;
// Update loadProxies to parse proxy types and create structured proxy objects
/**
 * Load proxies from a file with advanced configuration
 * @returns Array of proxy settings
 */
async function loadProxies() {
    try {
        // Get project root directory
        const projectRootDir = path.resolve(__dirname, '../../');
        const proxyPath = path.join(projectRootDir, 'proxies.txt');
        if (fs.existsSync(proxyPath)) {
            const data = fs.readFileSync(proxyPath, 'utf8');
            // Parse each line of the proxy file
            const proxies = data.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0 && !line.startsWith('#'))
                .map(proxyLine => {
                // Try to determine proxy type from URL
                let type = 'http';
                let url = proxyLine;
                let isResidential = false;
                // Check for residential indication in comments or URL
                if (proxyLine.includes('pr.oxylabs') ||
                    proxyLine.includes('residential') ||
                    proxyLine.includes('session')) {
                    isResidential = true;
                }
                if (proxyLine.startsWith('socks5://')) {
                    type = 'socks5';
                }
                else if (proxyLine.startsWith('socks4://')) {
                    type = 'socks4';
                }
                else if (proxyLine.startsWith('https://')) {
                    type = 'https';
                }
                else if (!proxyLine.includes('://')) {
                    // Add http:// protocol if missing
                    url = `http://${proxyLine}`;
                }
                return {
                    url,
                    type,
                    lastUsed: 0,
                    successCount: 0,
                    failureCount: 0,
                    isBanned: false,
                    isResidential
                };
            });
            console.log(chalk_1.default.green(`Loaded ${proxies.length} proxies from ${proxyPath}`));
            if (proxies.length > 0) {
                console.log(chalk_1.default.yellow('Note: To potentially bypass CAPTCHA protection, residential or datacenter proxies with rotating IPs are recommended.'));
                console.log(chalk_1.default.yellow('Format examples: http://username:password@host:port or socks5://username:password@host:port'));
            }
            return proxies;
        }
        else {
            console.log(chalk_1.default.yellow(`No proxies file found at ${proxyPath}. Creating a template file...`));
            // Create a template proxies file with instructions
            const templateContent = `# Proxy list for Pump.fun comment posting
# To potentially bypass CAPTCHA protection, use residential or datacenter proxies with rotating IPs
# Format examples: 
# http://username:password@host:port
# socks5://username:password@host:port
# http://host:port
# socks5://host:port
#
# For best results, use residential proxies with rotating IPs
# Many YouTube tutorials recommend these proxy providers:
# - Bright Data (brightdata.com)
# - Smartproxy (smartproxy.com) 
# - Oxylabs (oxylabs.io)
# - IPRoyal (iproyal.com)

# Add your proxies below (one per line):

`;
            fs.writeFileSync(proxyPath, templateContent);
            console.log(chalk_1.default.green(`Created template proxies file at ${proxyPath}. Add your proxies and run again.`));
            console.log(chalk_1.default.cyan('Tip: Some websites that provide rotating residential proxies:'));
            console.log(chalk_1.default.cyan('- Bright Data (brightdata.com)'));
            console.log(chalk_1.default.cyan('- Oxylabs (oxylabs.io)'));
            console.log(chalk_1.default.cyan('- Smartproxy (smartproxy.com)'));
            console.log(chalk_1.default.cyan('- IPRoyal (iproyal.com)'));
            return [];
        }
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error loading proxies: ${error.message}`));
        return [];
    }
}
// Create an axios instance with enhanced proxy support
function createAxiosInstance(proxy) {
    // Default configuration with browser-like headers
    const config = {
        timeout: 30000,
        headers: getBrowserLikeHeaders(),
        maxRedirects: 5
    };
    if (!proxy) {
        return axios_1.default.create(config);
    }
    let proxyUrl;
    let proxyType;
    if (typeof proxy === 'string') {
        proxyUrl = proxy;
        proxyType = proxy.startsWith('socks') ? 'socks' : 'http';
    }
    else {
        proxyUrl = proxy.url;
        proxyType = proxy.type.startsWith('socks') ? 'socks' : 'http';
    }
    // Extract proxy credentials if they exist
    try {
        const url = new URL(proxyUrl);
        // Check if this is an Oxylabs proxy
        const isOxylabs = url.hostname.includes('oxylabs');
        const isBrightData = url.hostname.includes('brightdata') || url.hostname.includes('luminati');
        const isSmartProxy = url.hostname.includes('smartproxy');
        console.log(chalk_1.default.gray(`Setting up proxy: ${hideProxyCredentials(proxyUrl)}`));
        // Set proxy auth at the agent level to handle 407 errors
        if (url.username && url.password) {
            if (proxyType === 'socks') {
                // SOCKS proxy with auth - Format as URL string
                const socksProxyUrl = `${url.protocol}//${url.username}:${url.password}@${url.hostname}:${url.port || '1080'}`;
                config.httpsAgent = new socks_proxy_agent_1.SocksProxyAgent(socksProxyUrl);
                config.httpAgent = config.httpsAgent;
                console.log(chalk_1.default.gray(`Using SOCKS proxy: ${hideProxyCredentials(proxyUrl)}`));
            }
            else {
                // HTTP/HTTPS proxy with auth
                if (isOxylabs) {
                    // Special handling for Oxylabs proxies
                    console.log(chalk_1.default.cyan(`Detected Oxylabs proxy, using specialized configuration...`));
                    // Extract username parts to check for session ID
                    const usernameParts = url.username.split('-');
                    let username = url.username;
                    // If there's no session ID in the username, add a random one
                    if (usernameParts.length === 1) {
                        // Create a random session ID
                        const randomSession = `session-${Math.random().toString(36).substring(2, 10)}`;
                        username = `${username}-${randomSession}`;
                        console.log(chalk_1.default.yellow(`Adding random session ID to Oxylabs username: ${username}`));
                    }
                    else {
                        console.log(chalk_1.default.gray(`Using existing session ID in Oxylabs username: ${username}`));
                    }
                    // Special Oxylabs headers for residential proxies
                    const specialHeaders = {
                        'X-Oxylabs-Session': username.split('-')[1] || 'default',
                        'User-Agent': getBrowserLikeHeaders()['User-Agent']
                    };
                    // Merge special headers
                    config.headers = { ...config.headers, ...specialHeaders };
                    // For Oxylabs, set direct proxy config instead of agent
                    config.proxy = {
                        host: url.hostname,
                        port: parseInt(url.port || '80'),
                        auth: {
                            username: username, // Use the modified username with session
                            password: url.password
                        },
                        protocol: url.protocol.replace(':', '')
                    };
                    // Make sure we don't use the agent - Oxylabs works better with direct proxy config
                    config.httpsAgent = undefined;
                    config.httpAgent = undefined;
                    // Add country targeting for Oxylabs if not already in username
                    if (!username.includes('country-')) {
                        // Add US as default country target
                        config.headers['X-Oxylabs-Geo-Location'] = 'US';
                        console.log(chalk_1.default.gray(`Setting geo-location to US for better Oxylabs performance`));
                    }
                }
                else if (isBrightData || isSmartProxy) {
                    // Special handling for Bright Data / SmartProxy
                    console.log(chalk_1.default.cyan(`Detected ${isBrightData ? 'Bright Data' : 'SmartProxy'} proxy, using specialized configuration...`));
                    // For these providers, the httpsAgent approach works better
                    const proxyAuthUrl = `${url.protocol}//${url.username}:${url.password}@${url.hostname}:${url.port || '80'}`;
                    config.httpsAgent = new https_proxy_agent_1.HttpsProxyAgent(proxyAuthUrl);
                    config.httpAgent = new https_proxy_agent_1.HttpsProxyAgent(proxyAuthUrl);
                    // Add special headers for session persistence
                    config.headers['Connection'] = 'keep-alive';
                    config.headers['Keep-Alive'] = 'timeout=60';
                }
                else {
                    // Standard HTTP proxy
                    const auth = {
                        username: url.username,
                        password: url.password
                    };
                    // Set proxy with auth
                    config.proxy = {
                        host: url.hostname,
                        port: url.port || (url.protocol === 'https:' ? '443' : '80'),
                        protocol: url.protocol,
                        auth: auth
                    };
                    // Also set auth headers directly
                    config.headers['Proxy-Authorization'] = `Basic ${Buffer.from(`${url.username}:${url.password}`).toString('base64')}`;
                }
                console.log(chalk_1.default.gray(`Using HTTP proxy with auth: ${hideProxyCredentials(proxyUrl)}`));
            }
        }
        else {
            // Proxy without auth
            if (proxyType === 'socks') {
                config.httpsAgent = new socks_proxy_agent_1.SocksProxyAgent(proxyUrl);
                config.httpAgent = new socks_proxy_agent_1.SocksProxyAgent(proxyUrl);
                console.log(chalk_1.default.gray(`Using SOCKS proxy: ${proxyUrl}`));
            }
            else {
                config.httpsAgent = new https_proxy_agent_1.HttpsProxyAgent(proxyUrl);
                config.httpAgent = new https_proxy_agent_1.HttpsProxyAgent(proxyUrl);
                console.log(chalk_1.default.gray(`Using HTTP proxy: ${proxyUrl}`));
            }
        }
    }
    catch (e) {
        // If URL parsing fails, try the old way
        if (proxyType === 'socks') {
            config.httpsAgent = new socks_proxy_agent_1.SocksProxyAgent(proxyUrl);
            config.httpAgent = new socks_proxy_agent_1.SocksProxyAgent(proxyUrl);
            console.log(chalk_1.default.gray(`Using SOCKS proxy: ${hideProxyCredentials(proxyUrl)}`));
        }
        else {
            config.httpsAgent = new https_proxy_agent_1.HttpsProxyAgent(proxyUrl);
            config.httpAgent = new https_proxy_agent_1.HttpsProxyAgent(proxyUrl);
            console.log(chalk_1.default.gray(`Using HTTP proxy: ${hideProxyCredentials(proxyUrl)}`));
        }
    }
    return axios_1.default.create(config);
}
// Helper function to hide credentials in proxy URL for logging
function hideProxyCredentials(proxyUrl) {
    try {
        // Remove credentials for logging
        const url = new URL(proxyUrl);
        if (url.username && url.password) {
            return proxyUrl.replace(`${url.username}:${url.password}@`, '****:****@');
        }
        return proxyUrl;
    }
    catch (e) {
        return proxyUrl; // Return original in case of parsing error
    }
}
// Enhance the getBrowserLikeHeaders function to appear more human-like
function getBrowserLikeHeaders() {
    // Enhanced list of modern user agents
    const userAgents = [
        // Chrome - Windows
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        // Chrome - Mac
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        // Firefox - Windows
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
        // Firefox - Mac
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0',
        // Safari - Mac
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
        // Edge - Windows
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'
    ];
    // Real-world accept languages
    const acceptLanguages = [
        'en-US,en;q=0.9',
        'en-US,en;q=0.8,es;q=0.5',
        'en-GB,en;q=0.9',
        'en-CA,en-US;q=0.9,en;q=0.8',
        'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'en-US,en;q=0.9,fr;q=0.8',
        'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
        'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7',
        'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
        'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
    ];
    // Realistic platforms
    const platforms = ['"Windows"', '"macOS"', '"Linux"', '"Android"', '"iOS"'];
    // Mobile indicator
    const isMobile = Math.random() > 0.8; // 20% chance to be a mobile device
    // Real-world viewport sizes - simulate screen size for fingerprinting
    const viewportSizes = {
        desktop: [
            { width: 1920, height: 1080 },
            { width: 1366, height: 768 },
            { width: 1440, height: 900 },
            { width: 1536, height: 864 },
            { width: 2560, height: 1440 },
            { width: 1680, height: 1050 }
        ],
        mobile: [
            { width: 360, height: 640 },
            { width: 390, height: 844 },
            { width: 414, height: 896 },
            { width: 375, height: 667 },
            { width: 428, height: 926 }
        ]
    };
    // Connection types
    const connectionTypes = ['4g', '5g', 'wifi'];
    // Choose random values
    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    const randomAcceptLanguage = acceptLanguages[Math.floor(Math.random() * acceptLanguages.length)];
    const randomPlatform = platforms[Math.floor(Math.random() * platforms.length)];
    const randomViewport = isMobile
        ? viewportSizes.mobile[Math.floor(Math.random() * viewportSizes.mobile.length)]
        : viewportSizes.desktop[Math.floor(Math.random() * viewportSizes.desktop.length)];
    const randomConnection = connectionTypes[Math.floor(Math.random() * connectionTypes.length)];
    // Determine browser and version from user agent
    let browserInfo = '"Not A(Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"';
    if (randomUserAgent.includes('Firefox')) {
        browserInfo = '"Firefox";v="128"';
    }
    else if (randomUserAgent.includes('Safari') && !randomUserAgent.includes('Chrome')) {
        browserInfo = '"Safari";v="18"';
    }
    else if (randomUserAgent.includes('Edg')) {
        browserInfo = '"Microsoft Edge";v="127"';
    }
    // Add some randomized timezone offset for fingerprinting
    const timezoneOffset = Math.floor(Math.random() * 24) - 12; // -12 to +12 hours
    const headers = {
        'User-Agent': randomUserAgent,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': randomAcceptLanguage,
        'Accept-Encoding': 'gzip, deflate, br',
        'Origin': 'https://pump.fun',
        'Referer': 'https://pump.fun/',
        'sec-ch-ua': browserInfo,
        'sec-ch-ua-mobile': isMobile ? '?1' : '?0',
        'sec-ch-ua-platform': randomPlatform,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'Connection': 'keep-alive',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache'
    };
    // Add DNT randomly (Do Not Track)
    if (Math.random() > 0.5) {
        headers['DNT'] = '1';
    }
    // Add realistic device memory fingerprinting information
    if (Math.random() > 0.5) {
        headers['Device-Memory'] = `${Math.pow(2, Math.floor(Math.random() * 4) + 2)}`;
    }
    // Add connection information
    if (Math.random() > 0.5) {
        headers['Downlink'] = (Math.random() * 10 + 1).toFixed(2);
        headers['ECT'] = randomConnection;
        headers['RTT'] = Math.floor(Math.random() * 200 + 50);
    }
    // Add viewport information mimicking what a real browser would expose
    if (Math.random() > 0.5) {
        headers['Viewport-Width'] = randomViewport.width;
        headers['Width'] = randomViewport.width;
    }
    // Add timezone information
    if (Math.random() > 0.5) {
        headers['Time-Zone'] = `GMT${timezoneOffset >= 0 ? '+' : '-'}${Math.abs(timezoneOffset)}00`;
    }
    // Add X-Forwarded-For with random values to appear as if request went through proxies
    // This will be overridden by actual proxies, but might help if a proxy doesn't add this header
    if (Math.random() > 0.7) {
        const randomIP = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
        headers['X-Forwarded-For'] = randomIP;
    }
    return headers;
}
// List of random positive comments
const POSITIVE_COMMENTS = [
    "This token is going to the moon! 🚀",
    "Bullish on this one! 🔥",
    "Great project with a solid team 👍",
    "I'm holding this gem long-term 💎",
    "Best token I've seen this week! ⭐",
    "Diamond hands for this one 💎🙌",
    "Love the roadmap on this project!",
    "Incredible potential here! 🌟",
    "Just got a bag, let's go! 🎯",
    "Solana's next 100x gem! 🤩",
    "Best community in crypto 🤝",
    "Early adopter checking in! 📈",
    "Can't wait to see where this goes! 🚀",
    "This is what we've been waiting for! 🔥",
    "Amazing tokenomics on this one 📊",
    "I'm not selling until we 50x 💰",
    "This team doesn't miss! 🎯",
    "Impressive project! 👏",
    "Pump it! 📈🚀",
    "Just bought a big bag 💼"
];
// Generate a random comment from the list
function getRandomComment(predefinedComments) {
    const comments = predefinedComments || POSITIVE_COMMENTS;
    const randomIndex = Math.floor(Math.random() * comments.length);
    return comments[randomIndex];
}
// Generate AI comment using OpenAI
async function generateAIComment(openaiKey, tokenMint, tokenInfo = null) {
    // Create OpenAI client using v4 syntax
    const openai = new openai_1.default({
        apiKey: openaiKey,
    });
    try {
        // Build a more varied prompt that avoids hashtags, liquidity and market cap
        let promptContent = '';
        if (tokenInfo) {
            promptContent = `Generate a short, positive comment (maximum 100 characters) for a cryptocurrency token called ${tokenInfo.name} (${tokenInfo.symbol}) on Solana.`;
            // Only add price if available - avoid mentioning liquidity or market cap
            if (tokenInfo.price) {
                promptContent += ` The current price is $${tokenInfo.price}.`;
            }
            promptContent += ` Make it sound like a typical crypto enthusiast comment. Include 1-2 emojis. Make it sound natural, casual and not corporate. Do NOT use hashtags, don't mention liquidity or market cap, and avoid generic phrases like "to the moon". Each comment should be unique and express a different sentiment. Keep it friendly and conversational.`;
        }
        else {
            // Fallback to basic prompt
            promptContent = `Generate a short, positive comment (maximum 100 characters) for a cryptocurrency token on Solana. Make it sound like a typical crypto enthusiast comment. Include 1-2 emojis. Make it sound natural, casual and not corporate. Do NOT use hashtags, don't mention liquidity or market cap, and avoid generic phrases like "to the moon". Keep it friendly and conversational.`;
        }
        // Add randomness factors to create variety
        const variations = [
            "Express excitement about the project.",
            "Mention that you just bought some.",
            "Say something about the community.",
            "Express optimism about the future.",
            "Mention that you like the tokenomics.",
            "Say you've been following this project.",
            "Express that you're impressed with the team.",
            "Mention that you're holding long-term.",
            "Ask a casual question about the project.",
            "Say something about the recent price action."
        ];
        // Add a random variation to the prompt
        const randomVariation = variations[Math.floor(Math.random() * variations.length)];
        promptContent += ` ${randomVariation}`;
        // Use the chat completions API with v4 syntax
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "You are a helpful assistant that creates short, enthusiastic cryptocurrency comments. Your comments should be diverse, casual, and sound like they're written by different people." },
                { role: "user", content: promptContent }
            ],
            max_tokens: 40,
            temperature: 0.9, // Increase temperature for more randomness
        });
        // Extract and clean up the response (v4 syntax)
        let comment = response.choices[0]?.message?.content?.trim() || "Love this project! 🚀";
        // Remove any hashtags that might have been added
        comment = comment.replace(/#\w+/g, '');
        // If comment is too long, truncate it
        if (comment.length > 100) {
            comment = comment.substring(0, 97) + "...";
        }
        return comment;
    }
    catch (error) {
        console.error(chalk_1.default.yellow(`Error generating AI comment: ${error.message}`));
        // Fallback to random comment if AI fails
        return getRandomComment();
    }
}
// Replace with focus on v3 endpoints only for better reliability
const apiEndpoints = [
    'https://frontend-api-v3.pump.fun',
    'https://client-proxy-server.pump.fun'
];
/**
 * Get existing replies for a token
 * @param tokenMint Token mint address
 * @param proxy Optional proxy to use
 * @returns Array of replies or empty array if none found/new token
 */
async function getExistingReplies(tokenMint, proxy) {
    const spinner = (0, ora_1.default)('Fetching existing replies...').start();
    // Make sure tokenMint is properly formatted
    if (!tokenMint || tokenMint.trim() === '' || tokenMint === 'address_here') {
        spinner.fail('Invalid token mint address provided');
        return [];
    }
    // Track overall attempts across endpoints
    let attemptCount = 0;
    const maxAttempts = 4; // Limit how many attempts we make to avoid hanging
    for (const baseUrl of apiEndpoints) {
        try {
            spinner.text = `Fetching replies from pump.fun...`;
            // Set up API client with optional proxy
            const client = createAxiosInstance(proxy);
            // Simplified to just focus on the main endpoint format
            const repliesUrl = `${baseUrl}/replies/${tokenMint}?limit=1000&offset=0`;
            try {
                console.log(chalk_1.default.gray(`Trying URL: ${repliesUrl}`));
                attemptCount++;
                // Make the request
                const response = await client.get(repliesUrl, {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    },
                    timeout: 10000 // Shorter timeout
                });
                // Check for valid response
                if (response.status === 200 && response.data) {
                    let replies = [];
                    // Handle different response formats
                    if (Array.isArray(response.data)) {
                        replies = response.data;
                    }
                    else if (response.data.replies && Array.isArray(response.data.replies)) {
                        replies = response.data.replies;
                    }
                    if (replies.length > 0) {
                        spinner.succeed(`Found ${replies.length} existing replies for this token`);
                        // Log some info about replies
                        console.log(chalk_1.default.gray(`Latest reply: "${replies[0].text.substring(0, 50)}..." by ${replies[0].user.substring(0, 8)}...`));
                        return replies;
                    }
                    else {
                        // Special handling for empty replies - likely a new token
                        spinner.succeed(`Token exists but has no replies yet - you'll be first!`);
                        return [];
                    }
                }
                else if (response.status === 404) {
                    // Handle 404 - usually means token exists but no replies 
                    spinner.succeed(`New token detected - no existing replies yet`);
                    return [];
                }
                else {
                    console.log(chalk_1.default.yellow(`Server returned status ${response.status} from pump.fun`));
                }
            }
            catch (urlError) {
                // Check if we should stop trying
                if (attemptCount >= maxAttempts) {
                    spinner.warn(`Stopping after ${attemptCount} attempts to fetch replies`);
                    break;
                }
                // More specific error messages based on error type
                if (urlError.code === 'ECONNABORTED') {
                    console.log(chalk_1.default.yellow(`Request to pump.fun timed out`));
                }
                else if (urlError.response && urlError.response.status === 404) {
                    // 404 error handling - new token
                    spinner.succeed(`New token with no replies - you'll be the first to comment!`);
                    return [];
                }
                else {
                    console.log(chalk_1.default.yellow(`Error with pump.fun: ${urlError.message}`));
                }
            }
        }
        catch (error) {
            console.log(chalk_1.default.yellow(`Error with pump.fun: ${error.message}`));
        }
    }
    // When we can't connect to any endpoint
    if (attemptCount === 0) {
        spinner.fail(`Could not connect to any pump.fun API endpoints`);
    }
    else {
        // If we tried but got no replies
        spinner.info(`No replies found for this token - it might be new or the API might be unreachable`);
    }
    // Return empty array to continue with posting
    return [];
}
/**
 * Post a comment using direct API endpoints from pump.fun
 * Based on https://github.com/BankkRoll/pumpfun-apis
 * Uses our enhanced implementation with structured authentication
 * @param wallet The wallet data with keypair used for signing
 * @param tokenMint The mint address of the token
 * @param comment The comment text to post
 * @param proxy Optional proxy to use
 * @param likeMode Optional flag to like comments after posting
 * @param likeCount Number of top comments to like (0 for all)
 * @param withImage Optional flag to include an image with the comment
 * @returns True if comment was posted successfully
 */
async function postCommentWithApi(wallet, tokenMint, comment, proxy, likeMode = false, likeCount = 0, withImage = false) {
    console.log(chalk_1.default.cyan(`Posting comment via pump.fun API...`));
    try {
        // First authenticate with the service - this now returns both authToken and awsToken
        const authResult = await (0, PumpFunWrapper_1.enhancedAuthenticate)(wallet, proxy);
        if (!authResult) {
            console.log(chalk_1.default.red('Failed to authenticate with Pump.fun'));
            return false;
        }
        console.log(chalk_1.default.green('Authentication successful, posting comment...'));
        // Use our enhanced implementation via the wrapper
        const result = await (0, PumpFunWrapper_1.enhancedPostComment)(wallet, tokenMint, comment, proxy, withImage);
        if (result) {
            console.log(chalk_1.default.green('Successfully posted comment!'));
            // Optionally like comments after posting if likeMode is enabled
            if (likeMode && likeCount !== undefined) {
                console.log(chalk_1.default.cyan(`Like mode enabled, liking ${likeCount === 0 ? 'all' : likeCount} comment(s)...`));
                try {
                    // Use the enhanced bulk liking implementation
                    const likesCount = await (0, PumpFunWrapper_1.enhancedBulkLikeComments)(tokenMint, authResult, undefined, // Use default reply fetching
                    proxy, likeCount);
                    if (likesCount > 0) {
                        console.log(chalk_1.default.green(`Successfully liked ${likesCount} comment(s).`));
                    }
                    else {
                        console.log(chalk_1.default.yellow('No comments were liked.'));
                    }
                }
                catch (likeError) {
                    console.log(chalk_1.default.yellow(`Error liking comments: ${likeError instanceof Error ? likeError.message : String(likeError)}`));
                }
            }
            return true;
        }
        else {
            console.log(chalk_1.default.red('Failed to post comment'));
            return false;
        }
    }
    catch (error) {
        console.log(chalk_1.default.red(`Error posting comment: ${error.message}`));
        return false;
    }
}
// Fix the compatibility issue with proxySettings
async function postReplies(wallets, tokenMint, apiKey, options) {
    const spinner = (0, ora_1.default)('Posting PumpFun replies...').start();
    let successCount = 0;
    let failureCount = 0;
    let totalComments = 0;
    let verifiedComments = 0;
    // Convert basic proxy strings to proxy settings if needed
    let proxySettings = [];
    if (options.proxies && options.proxies.length > 0) {
        // Convert string proxies to ProxySettings objects
        proxySettings = options.proxies.map(proxy => {
            if (typeof proxy === 'string') {
                const type = proxy.startsWith('socks5://') ? 'socks5' :
                    proxy.startsWith('socks4://') ? 'socks4' :
                        proxy.startsWith('https://') ? 'https' : 'http';
                // Check if this is an Oxylabs proxy
                const isOxylabs = proxy.includes('oxylabs');
                return {
                    url: proxy,
                    type,
                    lastUsed: 0,
                    successCount: 0,
                    failureCount: 0,
                    isBanned: false,
                    isResidential: isOxylabs // Mark Oxylabs proxies as residential
                };
            }
            // If it's already a ProxySettings object, return it
            return proxy;
        });
    }
    // Log the loaded proxies
    if (proxySettings.length > 0) {
        console.log(chalk_1.default.green(`Loaded ${proxySettings.length} proxies. Testing connectivity...`));
        // Do a preliminary check of the proxy settings
        for (const proxy of proxySettings) {
            try {
                // Check if this is likely an Oxylabs proxy
                if (proxy.url.includes('oxylabs')) {
                    console.log(chalk_1.default.cyan(`Detected Oxylabs proxy: ${hideProxyCredentials(proxy.url)}`));
                    // Extract username and password to check format
                    try {
                        const url = new URL(proxy.url);
                        if (url.username && url.password) {
                            console.log(chalk_1.default.green(`✓ Proxy has correct credential format`));
                            // Check if the username contains a session ID (customer-SESSIONID format)
                            if (url.username.includes('-')) {
                                console.log(chalk_1.default.green(`✓ Oxylabs proxy username contains session ID format`));
                            }
                            else {
                                console.log(chalk_1.default.yellow(`⚠️ Oxylabs proxy username should include a session ID (e.g., customer-SESSION123)`));
                            }
                        }
                        else {
                            console.log(chalk_1.default.red(`❌ Proxy URL is missing credentials. Format should be http://username:password@pr.oxylabs.io:7777`));
                        }
                    }
                    catch (e) {
                        console.log(chalk_1.default.red(`❌ Could not parse proxy URL: ${e.message}`));
                    }
                }
            }
            catch (error) {
                // Continue to next proxy if there's an error
                console.log(chalk_1.default.yellow(`Error checking proxy ${hideProxyCredentials(proxy.url)}: ${error.message}`));
            }
        }
    }
    // Check if API is available by fetching existing replies first
    try {
        spinner.text = "Checking if Pump.fun API is available...";
        // Try fetch with and without proxy to establish baseline connectivity
        let proxyForCheck;
        if (proxySettings.length > 0) {
            // Get a random proxy for the initial check
            proxyForCheck = proxySettings[Math.floor(Math.random() * proxySettings.length)];
        }
        // Try first without proxy
        try {
            const replies = await getExistingReplies(tokenMint);
            console.log(chalk_1.default.green(`Successfully fetched ${replies.length} existing replies from the API without proxy.`));
        }
        catch (directError) {
            console.log(chalk_1.default.yellow(`Could not fetch replies directly: ${directError.message}`));
            // If direct fetch fails, try with proxy
            if (proxyForCheck) {
                try {
                    const replies = await getExistingReplies(tokenMint, proxyForCheck);
                    console.log(chalk_1.default.green(`Successfully fetched ${replies.length} existing replies from the API using proxy.`));
                }
                catch (proxyError) {
                    console.log(chalk_1.default.red(`Could not fetch replies with proxy either: ${proxyError.message}`));
                    throw proxyError;
                }
            }
            else {
                throw directError;
            }
        }
    }
    catch (apiCheckError) {
        spinner.fail("Failed to access Pump.fun API.");
        console.error(chalk_1.default.red(`The Pump.fun API is currently protected by AWS WAF with CAPTCHA verification, which prevents automated posting.`));
        console.error(chalk_1.default.yellow(`Error details: ${apiCheckError.message}`));
        // Ask user if they want to continue anyway
        const continueAnswer = await inquirer_1.default.prompt([
            {
                type: 'confirm',
                name: 'continue',
                message: 'The Pump.fun API requires CAPTCHA verification, which will cause posting to fail without proper proxies. Continue anyway?',
                default: false
            }
        ]);
        if (!continueAnswer.continue) {
            console.log(chalk_1.default.cyan('Operation cancelled by user.'));
            return;
        }
        console.log(chalk_1.default.yellow('Continuing despite likely CAPTCHA protection...'));
    }
    // Create a global set to track comments used across ALL wallets to avoid duplicates
    const globalUsedComments = new Set();
    // Keep track of comments used to avoid duplicates from the same wallet
    const usedComments = new Map();
    // Get token info for better context using DexScreener API
    let tokenSymbol = tokenMint.substring(0, 6) + "...";
    let tokenInfo = options.tokenInfo || null;
    if (!tokenInfo) {
        try {
            // Use DexScreener API to get token information
            spinner.text = "Getting token information from DexScreener...";
            const dexScreenerUrl = `https://api.dexscreener.com/tokens/v1/solana/${tokenMint}`;
            console.log(chalk_1.default.gray(`Fetching token info from: ${dexScreenerUrl}`));
            const tokenInfoResponse = await axios_1.default.get(dexScreenerUrl, {
                headers: {
                    'Accept': 'application/json'
                },
                timeout: 10000
            });
            if (tokenInfoResponse.data && Array.isArray(tokenInfoResponse.data) && tokenInfoResponse.data.length > 0) {
                const pairInfo = tokenInfoResponse.data[0];
                // Check if this token is the base token
                if (pairInfo.baseToken && pairInfo.baseToken.address.toLowerCase() === tokenMint.toLowerCase()) {
                    tokenSymbol = pairInfo.baseToken.symbol;
                    tokenInfo = {
                        name: pairInfo.baseToken.name,
                        symbol: pairInfo.baseToken.symbol,
                        price: pairInfo.priceUsd,
                        liquidity: pairInfo.liquidity?.usd,
                        fdv: pairInfo.fdv,
                        marketCap: pairInfo.marketCap,
                        pairAddress: pairInfo.pairAddress,
                        dexId: pairInfo.dexId
                    };
                    console.log(chalk_1.default.green(`Found token info - Symbol: ${tokenSymbol}, Price: $${pairInfo.priceUsd}`));
                }
                // Check if this token is the quote token
                else if (pairInfo.quoteToken && pairInfo.quoteToken.address.toLowerCase() === tokenMint.toLowerCase()) {
                    tokenSymbol = pairInfo.quoteToken.symbol;
                    tokenInfo = {
                        name: pairInfo.quoteToken.name,
                        symbol: pairInfo.quoteToken.symbol,
                        price: pairInfo.priceUsd,
                        liquidity: pairInfo.liquidity?.usd,
                        fdv: pairInfo.fdv,
                        marketCap: pairInfo.marketCap,
                        pairAddress: pairInfo.pairAddress,
                        dexId: pairInfo.dexId
                    };
                    console.log(chalk_1.default.green(`Found token info - Symbol: ${tokenSymbol}, Price: $${pairInfo.priceUsd}`));
                }
            }
            else {
                console.warn(chalk_1.default.yellow(`No data returned from DexScreener for ${tokenMint}`));
            }
        }
        catch (error) {
            console.warn(chalk_1.default.yellow(`Could not get token info from DexScreener: ${error.message}`));
            console.warn(chalk_1.default.yellow(`Using mint address as reference.`));
        }
    }
    // Track proxy performance to prioritize successful ones
    let proxySuccessMap = new Map();
    let proxyFailureMap = new Map();
    let bannedProxies = new Set();
    // Process each wallet - using proxy rotation
    for (let i = 0; i < wallets.length; i++) {
        const wallet = wallets[i];
        usedComments.set(wallet.publicKey, new Set());
        // Proxy selection strategy
        let currentProxiesToTry = [];
        if (proxySettings.length > 0) {
            // Filter out banned proxies
            const availableProxies = proxySettings.filter(p => !p.isBanned && (!p.cooldownUntil || p.cooldownUntil < Date.now()));
            if (availableProxies.length === 0) {
                // If all proxies are on cooldown, take the ones with soonest expiry
                const sortedByExpiry = [...proxySettings]
                    .filter(p => !p.isBanned)
                    .sort((a, b) => (a.cooldownUntil || 0) - (b.cooldownUntil || 0));
                if (sortedByExpiry.length > 0) {
                    const nextAvailable = sortedByExpiry[0];
                    const waitTime = Math.ceil((nextAvailable.cooldownUntil || 0) - Date.now()) / 1000;
                    console.log(chalk_1.default.yellow(`All proxies are on cooldown. Waiting ${waitTime} seconds for next available proxy...`));
                    await (0, transaction_1.sleep)(Math.max(1000, nextAvailable.cooldownUntil || 0 - Date.now()));
                    currentProxiesToTry = [nextAvailable];
                }
                else {
                    console.log(chalk_1.default.red(`All proxies are banned. Attempting without proxy...`));
                    currentProxiesToTry = [];
                }
            }
            else {
                // Prioritize residential proxies first as they're more likely to work
                const residentialProxies = availableProxies.filter(p => p.isResidential === true);
                const datacenterProxies = availableProxies.filter(p => p.isResidential !== true);
                // Select proxies based on success rate and residential status
                const sortResidentialProxies = [...residentialProxies].sort((a, b) => {
                    const aSuccessRate = a.successCount ? a.successCount / (a.successCount + (a.failureCount || 0)) : 0;
                    const bSuccessRate = b.successCount ? b.successCount / (b.successCount + (b.failureCount || 0)) : 0;
                    return bSuccessRate - aSuccessRate; // Higher success rate first
                });
                const sortDatacenterProxies = [...datacenterProxies].sort((a, b) => {
                    const aSuccessRate = a.successCount ? a.successCount / (a.successCount + (a.failureCount || 0)) : 0;
                    const bSuccessRate = b.successCount ? b.successCount / (b.successCount + (b.failureCount || 0)) : 0;
                    return bSuccessRate - aSuccessRate; // Higher success rate first
                });
                // Build proxy list prioritizing residential over datacenter
                if (residentialProxies.length > 0) {
                    // Take best residential proxies first
                    currentProxiesToTry = sortResidentialProxies.slice(0, Math.min(2, sortResidentialProxies.length));
                    // Add one datacenter proxy as backup if available
                    if (datacenterProxies.length > 0) {
                        currentProxiesToTry.push(sortDatacenterProxies[0]);
                    }
                }
                else {
                    // No residential proxies, take top datacenter proxies
                    currentProxiesToTry = sortDatacenterProxies.slice(0, Math.min(3, sortDatacenterProxies.length));
                }
                // If we have few proxies, use all available
                if (availableProxies.length <= 3) {
                    currentProxiesToTry = availableProxies;
                }
            }
            console.log(chalk_1.default.gray(`Assigned ${currentProxiesToTry.length} proxies to wallet ${i + 1}/${wallets.length}`));
        }
        spinner.text = `Processing wallet ${i + 1}/${wallets.length}: ${wallet.publicKey.substring(0, 8)}...`;
        // Post multiple comments per wallet if requested
        for (let j = 0; j < options.commentsPerWallet; j++) {
            spinner.text = `Posting comment ${j + 1}/${options.commentsPerWallet} for wallet ${i + 1}/${wallets.length}`;
            // Default comment
            let defaultComment = "Great token! 🚀";
            let generatedComment = defaultComment;
            let finalComment = defaultComment;
            try {
                // Generate the comment
                if (options.useAi && options.openaiKey) {
                    // Generate AI comment with token info if available - try up to 3 times to get a unique comment
                    let attempts = 0;
                    const maxAttempts = 3;
                    do {
                        generatedComment = await generateAIComment(options.openaiKey, tokenMint, tokenInfo);
                        attempts++;
                        // If we've tried too many times or the comment is unique, break the loop
                        if (attempts >= maxAttempts || !globalUsedComments.has(generatedComment)) {
                            break;
                        }
                        console.log(chalk_1.default.yellow(`Generated duplicate AI comment, retrying (attempt ${attempts}/${maxAttempts})...`));
                    } while (attempts < maxAttempts);
                    // Add to used comments
                    globalUsedComments.add(generatedComment);
                }
                else if (options.randomize) {
                    // Get a random comment from the list, ensuring it's not been used before
                    const usedCommentsForWallet = usedComments.get(wallet.publicKey) || new Set();
                    let attempts = 0;
                    const maxAttempts = 10;
                    do {
                        // Get a new random comment
                        generatedComment = getRandomComment(options.predefinedComments);
                        attempts++;
                        // If we've tried too many times or found a unique comment (both globally and for this wallet), break
                        if (attempts >= maxAttempts || (!globalUsedComments.has(generatedComment) && !usedCommentsForWallet.has(generatedComment))) {
                            break;
                        }
                    } while (attempts < maxAttempts);
                    // Add to both wallet-specific and global used comments sets
                    usedCommentsForWallet.add(generatedComment);
                    globalUsedComments.add(generatedComment);
                    usedComments.set(wallet.publicKey, usedCommentsForWallet);
                }
                else if (options.customComment) {
                    // For custom comments, make them slightly different for each wallet
                    generatedComment = options.customComment;
                    // Modify the comment slightly for each wallet to avoid exact duplicates
                    if (i > 0) {
                        const emojis = ["🚀", "💎", "🔥", "⭐", "🌟", "💰", "📈", "🎯", "✨", "🌙"];
                        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                        // Add random emoji or exclamation mark to make the comment unique
                        if (Math.random() > 0.5) {
                            generatedComment += ` ${randomEmoji}`;
                        }
                        else {
                            generatedComment += Math.random() > 0.5 ? "!" : "";
                        }
                    }
                }
                // Use final comment
                finalComment = generatedComment;
                // Try with each proxy
                let posted = false;
                // Try each proxy in sequence
                for (const proxyToUse of currentProxiesToTry.length > 0 ? currentProxiesToTry : [undefined]) {
                    if (proxyToUse && proxyToUse.isBanned) {
                        console.log(chalk_1.default.gray(`Skipping banned proxy: ${hideProxyCredentials(proxyToUse.url)}`));
                        continue;
                    }
                    console.log(chalk_1.default.cyan(`Attempting to post comment via API ${proxyToUse ? 'with proxy' : 'without proxy'}: "${finalComment.substring(0, 30)}..."`));
                    try {
                        // Mark proxy as used
                        if (proxyToUse) {
                            proxyToUse.lastUsed = Date.now();
                        }
                        posted = await postCommentWithApi(wallet, tokenMint, finalComment, proxyToUse, options.likeMode, options.likeCount, options.withImage);
                        if (posted) {
                            successCount++;
                            totalComments++;
                            verifiedComments++;
                            // Update proxy success stats
                            if (proxyToUse) {
                                proxyToUse.successCount = (proxyToUse.successCount || 0) + 1;
                                console.log(chalk_1.default.green(`✓ Successfully posted comment with proxy ${hideProxyCredentials(proxyToUse.url)}`));
                            }
                            else {
                                console.log(chalk_1.default.green(`✓ Successfully posted comment without proxy`));
                            }
                            break; // Stop trying proxies if successful
                        }
                        else {
                            // Update proxy failure stats
                            if (proxyToUse) {
                                proxyToUse.failureCount = (proxyToUse.failureCount || 0) + 1;
                                // If proxy has too many failures, put it on a temporary cooldown
                                if (proxyToUse.failureCount > 3 && proxyToUse.successCount === 0) {
                                    console.log(chalk_1.default.yellow(`Proxy ${hideProxyCredentials(proxyToUse.url)} has failed ${proxyToUse.failureCount} times. Putting on 3-minute cooldown.`));
                                    proxyToUse.cooldownUntil = Date.now() + 3 * 60 * 1000; // 3 minute cooldown
                                }
                                console.log(chalk_1.default.yellow(`API comment posting failed with proxy: ${proxyToUse.url.split('@').pop() || proxyToUse.url}`));
                            }
                            else {
                                console.log(chalk_1.default.yellow(`API comment posting failed without proxy`));
                            }
                        }
                    }
                    catch (error) {
                        // Handle proxy-specific errors
                        if (proxyToUse) {
                            proxyToUse.failureCount = (proxyToUse.failureCount || 0) + 1;
                            // Check for proxy ban signals
                            if (error.message?.includes('ECONNREFUSED') ||
                                error.message?.includes('ETIMEDOUT') ||
                                error.message?.includes('socket hang up') ||
                                error.message?.includes('403')) {
                                console.log(chalk_1.default.red(`Proxy ${hideProxyCredentials(proxyToUse.url)} appears to be banned or not working.`));
                                proxyToUse.isBanned = true;
                                bannedProxies.add(proxyToUse.url);
                            }
                            else {
                                // Just a regular failure, add to cooldown if failures mounting
                                if (proxyToUse.failureCount > 2) {
                                    proxyToUse.cooldownUntil = Date.now() + 2 * 60 * 1000; // 2 minute cooldown
                                }
                            }
                        }
                    }
                }
                if (!posted) {
                    failureCount++;
                    console.log(chalk_1.default.red(`Failed to post comment after trying all available proxies.`));
                }
            }
            catch (error) {
                failureCount++;
                console.error(chalk_1.default.red(`\nError posting reply for ${wallet.publicKey}: ${error.message}`));
                if (error.stack) {
                    console.debug(chalk_1.default.gray(error.stack));
                }
            }
            // Add delay between comments using environment variables or defaults
            if (j < options.commentsPerWallet - 1) {
                // Use min and max interval from environment or defaults
                const minInterval = parseInt(process.env.COMMENT_MIN_INTERVAL || '3000');
                const maxInterval = parseInt(process.env.COMMENT_MAX_INTERVAL || '8000');
                // Calculate random delay within range
                const delay = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
                console.log(chalk_1.default.gray(`Waiting ${delay}ms before next comment...`));
                await (0, transaction_1.sleep)(delay);
            }
        }
        // Add delay between wallets to avoid rate limiting
        if (i < wallets.length - 1) {
            // Use a longer delay between different wallets - increase to 30-60 seconds
            const minInterval = parseInt(process.env.WALLET_MIN_INTERVAL || '30000'); // 30 seconds minimum
            const maxInterval = parseInt(process.env.WALLET_MAX_INTERVAL || '60000'); // 60 seconds maximum
            const walletDelay = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
            console.log(chalk_1.default.gray(`Waiting ${Math.round(walletDelay / 1000)} seconds before next wallet...`));
            await (0, transaction_1.sleep)(walletDelay);
        }
        // If we have more than 3 banned proxies, display a warning
        if (bannedProxies.size >= 3) {
            console.log(chalk_1.default.red(`WARNING: ${bannedProxies.size} proxies appear to be banned or not working.`));
            console.log(chalk_1.default.yellow(`This may be due to:
        1. Poor proxy quality (non-residential IPs are easily detected)
        2. Rate limiting from pump.fun
        3. IP reputation issues`));
            console.log(chalk_1.default.yellow(`Consider using higher quality residential rotating proxies.`));
        }
    }
    spinner.succeed('Reply posting complete');
    // Display summary
    console.log('\n' + chalk_1.default.cyan('====== REPLY POSTING SUMMARY ======'));
    // Display token info if available
    if (tokenInfo) {
        console.log(chalk_1.default.green(`Token: ${tokenInfo.name} (${tokenInfo.symbol})`));
        console.log(chalk_1.default.green(`Address: ${tokenMint.substring(0, 8)}...${tokenMint.substring(tokenMint.length - 4)}`));
        if (tokenInfo.price) {
            console.log(chalk_1.default.green(`Price: $${tokenInfo.price}`));
        }
        if (tokenInfo.liquidity) {
            console.log(chalk_1.default.green(`Liquidity: $${tokenInfo.liquidity.toLocaleString()}`));
        }
        if (tokenInfo.marketCap) {
            console.log(chalk_1.default.green(`Market Cap: $${tokenInfo.marketCap.toLocaleString()}`));
        }
        if (tokenInfo.dexId) {
            console.log(chalk_1.default.green(`DEX: ${tokenInfo.dexId}`));
        }
    }
    else {
        console.log(chalk_1.default.green(`Token: ${tokenSymbol} (${tokenMint.substring(0, 8)}...)`));
    }
    console.log(chalk_1.default.green(`Total wallets used: ${wallets.length}`));
    console.log(chalk_1.default.green(`Total comments posted: ${totalComments}`));
    console.log(chalk_1.default.green(`Verified comments: ${verifiedComments}`));
    console.log(chalk_1.default.green(`Successful replies: ${successCount}`));
    console.log(chalk_1.default.green(`Failed replies: ${failureCount}`));
    // Print proxy stats
    if (proxySettings.length > 0) {
        console.log(chalk_1.default.cyan('\nProxy Performance:'));
        const sortedProxies = [...proxySettings].sort((a, b) => (b.successCount || 0) - (a.successCount || 0));
        for (const proxy of sortedProxies) {
            const totalAttempts = (proxy.successCount || 0) + (proxy.failureCount || 0);
            const successRate = totalAttempts > 0 ? ((proxy.successCount || 0) / totalAttempts * 100).toFixed(1) : '0.0';
            const status = proxy.isBanned ? chalk_1.default.red('BANNED') :
                (proxy.cooldownUntil && proxy.cooldownUntil > Date.now()) ?
                    chalk_1.default.yellow('COOLDOWN') : chalk_1.default.green('ACTIVE');
            console.log(chalk_1.default.cyan(`${hideProxyCredentials(proxy.url)}: ${successRate}% success rate (${proxy.successCount || 0}/${totalAttempts}) - ${status}`));
        }
    }
    console.log(chalk_1.default.cyan('===================================='));
    // If many failures occurred with proxies, provide advice
    if (failureCount > successCount && proxySettings.length > 0) {
        console.log(chalk_1.default.yellow('\nTroubleshooting Tips:'));
        console.log(chalk_1.default.yellow('1. Try using high-quality residential rotating proxies'));
        console.log(chalk_1.default.yellow('2. Ensure proxies are not already banned by pump.fun'));
        console.log(chalk_1.default.yellow('3. Space out your requests by increasing the delay between comments'));
        console.log(chalk_1.default.yellow('4. Use fewer wallets in a single run to avoid triggering rate limits'));
    }
}
/**
 * Load predefined comments from file if available
 */
async function loadComments() {
    try {
        // Get project root directory
        const projectRootDir = path.resolve(__dirname, '../../');
        const commentsPath = path.join(projectRootDir, 'comments.txt');
        if (fs.existsSync(commentsPath)) {
            const data = fs.readFileSync(commentsPath, 'utf8');
            const comments = data.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0 && !line.startsWith('#'));
            console.log(chalk_1.default.green(`Loaded ${comments.length} predefined comments from ${commentsPath}`));
            return comments;
        }
        else {
            console.log(chalk_1.default.yellow(`No comments file found at ${commentsPath}. Creating a default one...`));
            // Create a default comments file with some examples
            const defaultComments = POSITIVE_COMMENTS.join('\n');
            fs.writeFileSync(commentsPath, defaultComments);
            console.log(chalk_1.default.green(`Created default comments file at ${commentsPath}`));
            return POSITIVE_COMMENTS;
        }
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error loading comments: ${error.message}`));
        return POSITIVE_COMMENTS;
    }
}
// Add a SigninMessage class following the pattern from the QuickNode guide
// Add this after the getBrowserLikeHeaders function
/**
 * SigninMessage class for structured message signing with Solana wallets
 * Based on the pattern from QuickNode's authentication guide
 */
class SigninMessage {
    constructor({ domain, publicKey, nonce, statement }) {
        this.domain = domain;
        this.publicKey = publicKey;
        this.nonce = nonce;
        this.statement = statement;
    }
    prepare() {
        return `${this.statement}\n\nWallet address: ${this.publicKey}\nNonce: ${this.nonce}`;
    }
    async validate(signature, publicKey) {
        const msg = this.prepare();
        const msgUint8 = new TextEncoder().encode(msg);
        const signatureUint8 = bs58.decode(signature);
        const pubKeyUint8 = bs58.decode(publicKey);
        return nacl.sign.detached.verify(msgUint8, signatureUint8, pubKeyUint8);
    }
}
