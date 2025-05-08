"use strict";
/**
 * PumpFunAuth.ts
 *
 * Utilities for authenticating with the PumpFun platform
 * Handles various authentication methods and proxy management
 */
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
exports.authenticateWithPumpFun = exports.establishBrowsingSession = exports.signMessage = exports.createAxiosInstance = exports.hideProxyCredentials = exports.getBrowserLikeHeaders = exports.PUMPFUN_API_ENDPOINTS = void 0;
const axios_1 = __importDefault(require("axios"));
const socks_proxy_agent_1 = require("socks-proxy-agent");
const https_proxy_agent_1 = require("https-proxy-agent");
const bs58 = __importStar(require("bs58"));
const nacl = __importStar(require("tweetnacl"));
const SigninMessage_1 = require("./SigninMessage");
const transaction_1 = require("./transaction");
const AuthSignature_1 = require("./AuthSignature");
const chalk_1 = __importDefault(require("chalk"));
// Supported API endpoints
exports.PUMPFUN_API_ENDPOINTS = [
    'https://frontend-api-v3.pump.fun',
    'https://client-proxy-server.pump.fun'
];
/**
 * Generate browser-like headers to appear more human-like
 * @returns Object containing browser headers
 */
function getBrowserLikeHeaders() {
    // Common user agents
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0'
    ];
    // Basic headers that work well with most services
    return {
        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Origin': 'https://pump.fun',
        'Referer': 'https://pump.fun/',
        'Connection': 'keep-alive',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache'
    };
}
exports.getBrowserLikeHeaders = getBrowserLikeHeaders;
/**
 * Hide proxy credentials when logging
 * @param proxyUrl Full proxy URL
 * @returns Masked proxy URL
 */
function hideProxyCredentials(proxyUrl) {
    try {
        const url = new URL(proxyUrl);
        if (url.username && url.password) {
            return proxyUrl.replace(`${url.username}:${url.password}@`, '***:***@');
        }
        return proxyUrl;
    }
    catch (error) {
        return proxyUrl;
    }
}
exports.hideProxyCredentials = hideProxyCredentials;
/**
 * Create an axios instance with enhanced proxy support
 * @param proxy Optional proxy configuration to use
 * @returns Configured Axios instance
 */
function createAxiosInstance(proxy) {
    // Default configuration with browser-like headers
    const config = {
        timeout: 30000,
        headers: getBrowserLikeHeaders(),
        maxRedirects: 5
    };
    // If no proxy provided, return a direct connection without logging
    if (!proxy) {
        return axios_1.default.create(config);
    }
    // Check if proxy is a simple boolean flag or has useProxy property 
    // (compatibility with legacy code and ProxyManager output)
    if (proxy === true || (typeof proxy === 'object' && proxy.useProxy === true && !proxy.url && !proxy.httpsAgent)) {
        console.log(chalk_1.default.yellow('Proxy requested but no valid proxy configuration provided'));
        return axios_1.default.create(config);
    }
    // Handle the case where proxy already has an httpsAgent
    if (proxy.httpsAgent) {
        config.httpsAgent = proxy.httpsAgent;
        config.httpAgent = proxy.httpAgent || proxy.httpsAgent;
        return axios_1.default.create(config);
    }
    // Wrap the proxy configuration in a try/catch to ensure we can always connect
    try {
        let proxyUrl;
        let proxyType;
        // Determine proxy URL and type based on different input formats
        if (typeof proxy === 'string') {
            proxyUrl = proxy;
            proxyType = proxy.startsWith('socks') ? 'socks' : 'http';
        }
        else if (proxy.url) {
            proxyUrl = proxy.url;
            proxyType = (proxy.type || '').startsWith('socks') ? 'socks' : 'http';
        }
        else if (proxy.host && proxy.port) {
            // Handle ProxyManager output format
            const protocol = proxy.protocol || 'http';
            const auth = proxy.auth ? `${encodeURIComponent(proxy.auth.username)}:${encodeURIComponent(proxy.auth.password)}@` : '';
            proxyUrl = `${protocol}://${auth}${proxy.host}:${proxy.port}`;
            proxyType = protocol.startsWith('socks') ? 'socks' : 'http';
        }
        else {
            console.log(chalk_1.default.yellow('Invalid proxy configuration, using direct connection'));
            return axios_1.default.create(config);
        }
        try {
            const url = new URL(proxyUrl);
            // Detect proxy provider
            const isOxylabs = url.hostname.includes('oxylabs');
            const isBrightData = url.hostname.includes('brightdata') || url.hostname.includes('luminati');
            const isSmartProxy = url.hostname.includes('smartproxy');
            console.log(chalk_1.default.gray(`Setting up proxy: ${hideProxyCredentials(proxyUrl)}`));
            // Extract username and password for auth
            const username = url.username;
            const password = url.password;
            // Handle authentication based on proxy type
            if (username && password) {
                if (proxyType === 'socks') {
                    // SOCKS proxy with auth - ensure URL is properly formed
                    try {
                        const socksProxyUrl = `${url.protocol}//${encodeURIComponent(username)}:${encodeURIComponent(password)}@${url.hostname}:${url.port || '1080'}`;
                        config.httpsAgent = new socks_proxy_agent_1.SocksProxyAgent(socksProxyUrl);
                        config.httpAgent = config.httpsAgent;
                        console.log(chalk_1.default.gray(`Using SOCKS proxy: ${hideProxyCredentials(proxyUrl)}`));
                    }
                    catch (socksError) {
                        console.log(chalk_1.default.red(`Error setting up SOCKS proxy: ${socksError}`));
                        return axios_1.default.create(config); // Return direct connection on error
                    }
                }
                else {
                    // HTTP/HTTPS proxy handling based on provider
                    if (isOxylabs) {
                        // SIMPLIFIED APPROACH FOR OXYLABS:
                        // Oxylabs requires a specific configuration that is more reliable
                        console.log(chalk_1.default.cyan(`Using simple direct configuration for Oxylabs proxy...`));
                        // Determine if this is a datacenter or residential proxy
                        const isDatacenter = url.hostname.includes('dc.oxylabs');
                        const isResidential = url.hostname.includes('pr.oxylabs');
                        console.log(chalk_1.default.cyan(`Detected Oxylabs ${isDatacenter ? 'datacenter' : isResidential ? 'residential' : 'unknown'} proxy`));
                        // Extract username parts to check for session ID
                        const usernameParts = username.split('-');
                        let modifiedUsername = username;
                        // Handle session ID differently for datacenter vs residential
                        if (isDatacenter) {
                            // Datacenter proxies don't need session IDs typically
                            console.log(chalk_1.default.green(`Using datacenter proxy configuration`));
                            // Simple proxy setup for datacenter - just use the direct URL
                            try {
                                const directProxyUrl = `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${url.hostname}:${url.port || '10000'}`;
                                // Using agent approach for datacenter proxies
                                const proxyAgent = new https_proxy_agent_1.HttpsProxyAgent(directProxyUrl);
                                config.httpsAgent = proxyAgent;
                                config.httpAgent = proxyAgent;
                                // For datacenter, setting the proxy property directly works well
                                config.proxy = {
                                    host: url.hostname,
                                    port: parseInt(url.port || '10000'),
                                    auth: {
                                        username: username,
                                        password: password
                                    },
                                    protocol: 'http'
                                };
                            }
                            catch (dcError) {
                                console.log(chalk_1.default.red(`Error setting up datacenter proxy: ${dcError}`));
                                return axios_1.default.create(config);
                            }
                        }
                        else {
                            // Residential proxies may need session IDs
                            if (usernameParts.length === 1) {
                                // Create a random session ID
                                const randomSession = `session-${Math.random().toString(36).substring(2, 10)}`;
                                modifiedUsername = `${username}-${randomSession}`;
                                console.log(chalk_1.default.yellow(`Adding random session ID to Oxylabs username: ${modifiedUsername}`));
                            }
                            // Create a direct proxy URL with proper encoding of credentials
                            try {
                                const directProxyUrl = `http://${encodeURIComponent(modifiedUsername)}:${encodeURIComponent(password)}@${url.hostname}:${url.port || '7777'}`;
                                // Using only HttpsProxyAgent - this is the key for Oxylabs
                                const proxyAgent = new https_proxy_agent_1.HttpsProxyAgent(directProxyUrl);
                                config.httpsAgent = proxyAgent;
                                config.httpAgent = proxyAgent;
                                // Do NOT set config.proxy for residential Oxylabs - use only the agent
                                config.proxy = false;
                            }
                            catch (resError) {
                                console.log(chalk_1.default.red(`Error setting up residential proxy: ${resError}`));
                                return axios_1.default.create(config);
                            }
                        }
                        // Always set auth header directly - this helps with both types
                        config.headers['Proxy-Authorization'] = `Basic ${Buffer.from(`${isDatacenter ? username : modifiedUsername}:${password}`).toString('base64')}`;
                        // Set specific headers for Oxylabs session - only for residential proxies
                        if (!isDatacenter && usernameParts.length >= 2) {
                            config.headers['X-Oxylabs-Session'] = usernameParts[1];
                        }
                        // Add US as default country target if not specified - only for residential
                        if (!isDatacenter && !username.includes('country-')) {
                            config.headers['X-Oxylabs-Geo-Location'] = 'US';
                        }
                        console.log(chalk_1.default.green(`✓ Configured Oxylabs proxy with simplified approach`));
                    }
                    else if (isBrightData || isSmartProxy) {
                        // Special handling for Bright Data / SmartProxy
                        console.log(chalk_1.default.cyan(`Detected ${isBrightData ? 'Bright Data' : 'SmartProxy'} proxy, using specialized configuration...`));
                        // For these providers, we'll use both techniques to ensure it works
                        try {
                            const proxyAuthUrl = `${url.protocol}//${encodeURIComponent(username)}:${encodeURIComponent(password)}@${url.hostname}:${url.port || '80'}`;
                            config.httpsAgent = new https_proxy_agent_1.HttpsProxyAgent(proxyAuthUrl);
                            config.httpAgent = new https_proxy_agent_1.HttpsProxyAgent(proxyAuthUrl);
                            // Also set direct proxy config with auth
                            config.proxy = {
                                protocol: url.protocol.replace(':', ''),
                                host: url.hostname,
                                port: parseInt(url.port || '80'),
                                auth: {
                                    username: username,
                                    password: password
                                }
                            };
                            // Add authorization header for good measure
                            config.headers['Proxy-Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
                            // Add special headers for session persistence
                            config.headers['Connection'] = 'keep-alive';
                            config.headers['Keep-Alive'] = 'timeout=60';
                        }
                        catch (bdError) {
                            console.log(chalk_1.default.red(`Error setting up BrightData/SmartProxy: ${bdError}`));
                            return axios_1.default.create(config);
                        }
                    }
                    else {
                        // Standard HTTP proxy
                        console.log(chalk_1.default.gray(`Using standard HTTP proxy with auth: ${hideProxyCredentials(proxyUrl)}`));
                        try {
                            // Set proxy with auth
                            config.proxy = {
                                protocol: url.protocol.replace(':', ''),
                                host: url.hostname,
                                port: parseInt(url.port || '80'),
                                auth: {
                                    username: username,
                                    password: password
                                }
                            };
                            // Also set auth headers directly
                            config.headers['Proxy-Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
                        }
                        catch (stdError) {
                            console.log(chalk_1.default.red(`Error setting up standard proxy: ${stdError}`));
                            return axios_1.default.create(config);
                        }
                    }
                }
            }
            else if (url.hostname) {
                // Proxy without auth
                console.log(chalk_1.default.gray(`Using proxy without authentication: ${proxyUrl}`));
                try {
                    if (proxyType === 'socks') {
                        const socksProxyUrl = `${url.protocol}//${url.hostname}:${url.port || '1080'}`;
                        config.httpsAgent = new socks_proxy_agent_1.SocksProxyAgent(socksProxyUrl);
                        config.httpAgent = config.httpsAgent;
                    }
                    else {
                        config.proxy = {
                            protocol: url.protocol.replace(':', ''),
                            host: url.hostname,
                            port: parseInt(url.port || '80')
                        };
                    }
                }
                catch (noAuthError) {
                    console.log(chalk_1.default.red(`Error setting up proxy without auth: ${noAuthError}`));
                    return axios_1.default.create(config);
                }
            }
        }
        catch (urlParseError) {
            console.error(chalk_1.default.red(`Error parsing proxy URL: ${urlParseError}`));
            // Fallback to direct connection
            return axios_1.default.create({
                timeout: 30000,
                headers: getBrowserLikeHeaders(),
            });
        }
        // Create the axios instance with our configuration
        const axiosInstance = axios_1.default.create(config);
        // Add response interceptor to detect and handle proxy errors
        axiosInstance.interceptors.response.use(response => response, async (error) => {
            // Check for proxy authentication error (407)
            if (error.response && error.response.status === 407) {
                console.log(chalk_1.default.red('Got 407 Proxy Authentication Required error.'));
                // Check if this is an Oxylabs proxy
                const isOxylabs = (typeof proxy === 'string' && proxy.includes('oxylabs')) ||
                    (typeof proxy !== 'string' && proxy.url && proxy.url.includes('oxylabs'));
                if (isOxylabs) {
                    try {
                        console.log(chalk_1.default.yellow('Retrying with alternative Oxylabs configuration...'));
                        // Parse the URL again
                        const url = new URL(proxyUrl);
                        const username = url.username;
                        const password = url.password;
                        const hostname = url.hostname;
                        // Check if this is a datacenter or residential proxy
                        const isDatacenter = hostname.includes('dc.oxylabs');
                        const isResidential = hostname.includes('pr.oxylabs');
                        if (username && password) {
                            // Create different retry configuration based on proxy type
                            let simpleConfig;
                            if (isDatacenter) {
                                console.log(chalk_1.default.cyan('Retrying datacenter proxy with simplified configuration'));
                                // For datacenter proxies - try direct proxy configuration without extra headers
                                simpleConfig = {
                                    ...config,
                                    // Use encoded credentials
                                    proxy: {
                                        host: hostname,
                                        port: parseInt(url.port || '10000'),
                                        auth: {
                                            username: username,
                                            password: password
                                        },
                                        protocol: 'http'
                                    },
                                    // Remove agents
                                    httpsAgent: undefined,
                                    httpAgent: undefined,
                                    // Basic headers only
                                    headers: {
                                        ...config.headers,
                                        'Proxy-Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
                                    }
                                };
                            }
                            else {
                                console.log(chalk_1.default.cyan('Retrying residential proxy with simplified configuration'));
                                // For residential proxies - try agent only approach
                                const directProxyUrl = `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${hostname}:${url.port || '7777'}`;
                                simpleConfig = {
                                    ...config,
                                    // Use encoded credentials with agent only
                                    httpsAgent: new https_proxy_agent_1.HttpsProxyAgent(directProxyUrl),
                                    // Remove proxy property completely
                                    proxy: false,
                                    // Add auth header
                                    headers: {
                                        ...config.headers,
                                        'Proxy-Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
                                    }
                                };
                            }
                            console.log(chalk_1.default.green('Retrying with simplified Oxylabs configuration...'));
                            const retryInstance = axios_1.default.create(simpleConfig);
                            // Copy the original request config
                            const retryConfig = { ...error.config };
                            // Ensure the retry doesn't use the original axios instance
                            delete retryConfig.httpsAgent;
                            delete retryConfig.httpAgent;
                            delete retryConfig.proxy;
                            // Make the request with our new instance
                            return retryInstance.request(retryConfig);
                        }
                    }
                    catch (retryError) {
                        console.log(chalk_1.default.red('Failed to retry with alternative configuration:'), retryError);
                    }
                }
            }
            return Promise.reject(error);
        });
        return axiosInstance;
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error creating Axios instance: ${error}`));
        return axios_1.default.create({
            timeout: 30000,
            headers: getBrowserLikeHeaders(),
        });
    }
}
exports.createAxiosInstance = createAxiosInstance;
/**
 * Sign a message with a wallet's private key
 * @param message Message to sign
 * @param secretKey Private key to sign with
 * @returns Base58 encoded signature
 */
function signMessage(message, secretKey) {
    const messageBytes = (0, SigninMessage_1.encodeMessageForSigning)(message);
    const signature = nacl.sign.detached(messageBytes, secretKey);
    return bs58.encode(signature);
}
exports.signMessage = signMessage;
/**
 * Establish a browsing session to mimic real user behavior
 * @param client Axios client to use
 */
async function establishBrowsingSession(client) {
    try {
        // Initial delay before first request (1.5-3 seconds)
        const preDelay = Math.floor(Math.random() * 1500) + 1500;
        await (0, transaction_1.sleep)(preDelay);
        // Visit the main site with full browser-like headers
        const mainPageResponse = await client.get('https://pump.fun/', {
            headers: {
                ...getBrowserLikeHeaders(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
            },
            timeout: 15000,
            withCredentials: true // Important - maintain cookies across requests
        });
        // Check if we received cookies
        const hasCookies = !!mainPageResponse.headers['set-cookie'];
        // Wait like a human would after page load (1-2.5 seconds)
        await (0, transaction_1.sleep)(Math.floor(Math.random() * 1500) + 1000);
        // Visit the wallet section to simulate a user preparing to login
        await client.get('https://pump.fun/wallet', {
            headers: {
                ...getBrowserLikeHeaders(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
            },
            timeout: 15000,
            withCredentials: true
        });
        // Wait between views (1-3 seconds)
        await (0, transaction_1.sleep)(Math.floor(Math.random() * 2000) + 1000);
        return hasCookies;
    }
    catch (error) {
        console.error(`Error establishing browsing session: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}
exports.establishBrowsingSession = establishBrowsingSession;
/**
 * Extract cookies from the Set-Cookie header
 */
function extractCookies(cookieString) {
    if (!cookieString)
        return {};
    const cookieMap = {};
    const COOKIE_NAMES = ['cf_clearance', '__cf_bm', 'auth_token', '_ga', '_ga_T65NVS2TQ6', 'fs_lua', 'fs_uid'];
    // Handle both string and string[] types for cookieString
    const cookiesArray = Array.isArray(cookieString) ? cookieString : [cookieString];
    cookiesArray.forEach(cookie => {
        cookie.split(',').forEach(part => {
            const [name, ...rest] = part.split('=');
            const trimmedName = name.trim();
            if (COOKIE_NAMES.includes(trimmedName)) {
                cookieMap[trimmedName] = rest.join('=').split(';')[0].trim();
            }
        });
    });
    return cookieMap;
}
/**
 * Get AWS token using auth cookies
 */
async function getAwsToken(client, publicKey, cookies, retries = 0) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000;
    try {
        console.log(chalk_1.default.gray(`Getting AWS token for user ${publicKey.substring(0, 8)}...`));
        const cookieString = Object.entries(cookies)
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');
        // Try multiple API endpoints
        for (const baseUrl of exports.PUMPFUN_API_ENDPOINTS) {
            try {
                const response = await client.get(`${baseUrl}/token/generateTokenForThread?user=${publicKey}`, {
                    headers: {
                        'Cookie': cookieString
                    }
                });
                if (response.data?.token) {
                    return response.data.token;
                }
            }
            catch (endpointError) {
                console.log(chalk_1.default.yellow(`Failed to get AWS token from ${baseUrl}: ${endpointError.message}`));
                // Continue to next endpoint
            }
        }
        throw new Error('AWS token not found in any endpoint response');
    }
    catch (error) {
        if (retries < MAX_RETRIES) {
            console.log(chalk_1.default.yellow(`AWS token attempt ${retries + 1} failed, retrying in ${RETRY_DELAY / 1000}s...`));
            await (0, transaction_1.sleep)(RETRY_DELAY);
            return getAwsToken(client, publicKey, cookies, retries + 1);
        }
        console.error(chalk_1.default.red(`All AWS token attempts failed: ${error.message}`));
        return null;
    }
}
/**
 * Try all authentication methods in sequence
 * @param client Configured axios client
 * @param wallet Wallet data for authentication
 * @returns Authentication token if successful, null otherwise
 */
async function authenticateWithAllMethods(client, wallet) {
    // For each API endpoint
    for (const baseUrl of exports.PUMPFUN_API_ENDPOINTS) {
        try {
            console.log(chalk_1.default.gray(`Trying authentication methods with ${baseUrl}...`));
            // Method 1: Modern structured authentication with SigninMessage
            try {
                // Create a properly structured sign-in message
                const signinMessage = SigninMessage_1.SigninMessage.createPumpFunMessage(wallet.publicKey);
                const message = signinMessage.prepare();
                // Sign the prepared message
                const signature = signMessage(message, wallet.secretKey);
                console.log(chalk_1.default.gray(`Authenticating with ${baseUrl}/auth/login...`));
                // Try auth endpoint with structured payload
                const loginResponse = await client.post(`${baseUrl}/auth/login`, {
                    wallet: wallet.publicKey,
                    publicKey: wallet.publicKey,
                    signature: signature,
                    message: message,
                    timestamp: Date.now(),
                    nonce: signinMessage.nonce,
                    domain: signinMessage.domain
                }, {
                    headers: {
                        ...getBrowserLikeHeaders(),
                        'Content-Type': 'application/json'
                    },
                    withCredentials: true,
                    timeout: 20000
                });
                // Check for success response
                if (loginResponse.status >= 200 && loginResponse.status < 300) {
                    // Extract token from various possible formats
                    const data = loginResponse.data;
                    const token = data?.token || data?.accessToken || data?.access_token;
                    if (token) {
                        console.log(chalk_1.default.green(`Successfully authenticated with structured message at ${baseUrl}`));
                        return token;
                    }
                }
            }
            catch (structuredAuthError) {
                console.log(chalk_1.default.yellow(`Structured auth failed with ${baseUrl}: ${structuredAuthError.message}`));
                // Check for CAPTCHA
                if (isCaptchaError(structuredAuthError)) {
                    throw new Error("CAPTCHA verification required");
                }
            }
            // Method 2: Request a nonce then sign it (legacy flow)
            try {
                // Add random delay
                await (0, transaction_1.sleep)(Math.floor(Math.random() * 1000) + 800);
                // Request nonce from the server
                console.log(chalk_1.default.gray(`Requesting nonce from ${baseUrl}/auth/nonce...`));
                const nonceResponse = await client.post(`${baseUrl}/auth/nonce`, {
                    wallet: wallet.publicKey,
                    address: wallet.publicKey
                }, {
                    headers: {
                        ...getBrowserLikeHeaders(),
                        'Content-Type': 'application/json'
                    },
                    withCredentials: true,
                    timeout: 15000
                });
                // Extract nonce
                const nonce = nonceResponse.data?.nonce;
                if (nonce) {
                    console.log(chalk_1.default.gray(`Successfully received nonce: ${nonce}`));
                    // Create auth message with the received nonce
                    const serverMessage = SigninMessage_1.SigninMessage.createFromServerNonce(wallet.publicKey, nonce);
                    const message = serverMessage.prepare();
                    // Sign the message
                    const signature = signMessage(message, wallet.secretKey);
                    // Wait a bit before submitting (like a real user would)
                    await (0, transaction_1.sleep)(Math.floor(Math.random() * 1000) + 500);
                    // Submit the signature
                    console.log(chalk_1.default.gray(`Submitting signed nonce to ${baseUrl}/auth/login...`));
                    const authResponse = await client.post(`${baseUrl}/auth/login`, {
                        nonce: nonce,
                        publicKey: wallet.publicKey,
                        wallet: wallet.publicKey,
                        signature: signature,
                        message: message
                    }, {
                        headers: {
                            ...getBrowserLikeHeaders(),
                            'Content-Type': 'application/json'
                        },
                        withCredentials: true,
                        timeout: 15000
                    });
                    // Check for token
                    const token = authResponse.data?.token || authResponse.data?.accessToken;
                    if (token) {
                        console.log(chalk_1.default.green(`Successfully authenticated with nonce flow at ${baseUrl}`));
                        return token;
                    }
                }
            }
            catch (nonceError) {
                console.log(chalk_1.default.yellow(`Nonce-based auth failed with ${baseUrl}: ${nonceError.message}`));
                // Check for CAPTCHA
                if (isCaptchaError(nonceError)) {
                    throw new Error("CAPTCHA verification required");
                }
            }
            // Method 3: Simple authentication with timestamp (fallback)
            try {
                // Add random delay
                await (0, transaction_1.sleep)(Math.floor(Math.random() * 800) + 500);
                // Create a simple message with timestamp
                const timestamp = Date.now();
                const simpleMessage = `Sign in to pump.fun: ${wallet.publicKey}-${timestamp}`;
                // Sign the simple message
                const signature = signMessage(simpleMessage, wallet.secretKey);
                // Try simple login
                console.log(chalk_1.default.gray(`Trying simple auth with ${baseUrl}/login...`));
                const loginResponse = await client.post(`${baseUrl}/login`, {
                    wallet: wallet.publicKey,
                    publicKey: wallet.publicKey,
                    signature: signature,
                    message: simpleMessage,
                    timestamp: timestamp
                }, {
                    headers: {
                        ...getBrowserLikeHeaders(),
                        'Content-Type': 'application/json'
                    },
                    withCredentials: true,
                    timeout: 15000
                });
                // Check for token
                const token = loginResponse.data?.token || loginResponse.data?.accessToken;
                if (token) {
                    console.log(chalk_1.default.green(`Successfully authenticated with simple auth at ${baseUrl}`));
                    return token;
                }
            }
            catch (simpleError) {
                console.log(chalk_1.default.yellow(`Simple auth failed with ${baseUrl}: ${simpleError.message}`));
                // Check for CAPTCHA
                if (isCaptchaError(simpleError)) {
                    throw new Error("CAPTCHA verification required");
                }
            }
        }
        catch (endpointError) {
            console.log(chalk_1.default.yellow(`All auth methods failed with ${baseUrl}: ${endpointError.message}`));
            // For some errors, we shouldn't continue trying
            if (isCaptchaError(endpointError)) {
                console.log(chalk_1.default.red(`CAPTCHA detected. Authentication not possible without human interaction.`));
                throw endpointError;
            }
        }
    }
    console.log(chalk_1.default.yellow('All authentication methods failed on all endpoints'));
    return null;
}
/**
 * Authenticate with the PumpFun platform using wallet credentials
 * @param wallet The wallet data to use for authentication
 * @param proxy Optional proxy configuration for the requests
 * @returns Authentication token string or null on failure
 */
async function authenticateWithPumpFun(wallet, proxy) {
    try {
        console.log(chalk_1.default.cyan(`Authenticating wallet ${wallet.publicKey.substring(0, 8)}...`));
        // Create an axios instance with the proxy if provided
        const client = createAxiosInstance(proxy);
        // First try direct authentication which is most reliable
        // This directly follows the reference implementation
        try {
            // Create the authentication payload
            const authPayload = await (0, AuthSignature_1.createAuthPayload)(wallet.publicKey, wallet.secretKey);
            // Common headers for all authentication requests
            const headers = {
                "Content-Type": "application/json",
                "Accept": "*/*",
                "Origin": "https://pump.fun",
                "Referer": "https://pump.fun/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
            };
            // 1. Try client-proxy-server.pump.fun endpoint first (most reliable method)
            const clientProxyUrl = "https://client-proxy-server.pump.fun";
            try {
                console.log(chalk_1.default.gray(`Trying auth with ${clientProxyUrl}/auth/login...`));
                const response = await client.post(`${clientProxyUrl}/auth/login`, authPayload, {
                    headers: headers
                });
                // Successfully authenticated via client proxy server
                if (response.status >= 200 && response.status < 300) {
                    // Extract cookies from response headers
                    const cookies = extractCookies(response.headers['set-cookie']);
                    if (cookies.auth_token) {
                        console.log(chalk_1.default.green('✓ Authenticated with client-proxy-server.pump.fun'));
                        // Get AWS token
                        const awsToken = await getAwsToken(client, wallet.publicKey, cookies);
                        return {
                            authToken: cookies.auth_token,
                            awsToken: awsToken || '',
                            userPublicKey: wallet.publicKey
                        };
                    }
                }
            }
            catch (clientProxyError) {
                console.log(chalk_1.default.yellow(`Client proxy auth failed: ${clientProxyError instanceof Error ? clientProxyError.message : String(clientProxyError)}`));
            }
            // 2. Try with frontend-api-v3.pump.fun (second most reliable)
            const apiV3Url = "https://frontend-api-v3.pump.fun";
            try {
                console.log(chalk_1.default.gray(`Trying auth with ${apiV3Url}/auth/login...`));
                const response = await client.post(`${apiV3Url}/auth/login`, authPayload, {
                    headers: headers
                });
                // Successfully authenticated via API V3
                if (response.status >= 200 && response.status < 300) {
                    // Extract cookies from response headers
                    const cookies = extractCookies(response.headers['set-cookie']);
                    if (cookies.auth_token) {
                        console.log(chalk_1.default.green('✓ Authenticated with frontend-api-v3.pump.fun'));
                        // Get AWS token
                        const awsToken = await getAwsToken(client, wallet.publicKey, cookies);
                        return {
                            authToken: cookies.auth_token,
                            awsToken: awsToken || '',
                            userPublicKey: wallet.publicKey
                        };
                    }
                }
            }
            catch (apiV3Error) {
                console.log(chalk_1.default.yellow(`API V3 auth failed: ${apiV3Error instanceof Error ? apiV3Error.message : String(apiV3Error)}`));
            }
        }
        catch (directAuthError) {
            console.log(chalk_1.default.yellow(`Direct authentication failed: ${directAuthError instanceof Error ? directAuthError.message : String(directAuthError)}`));
        }
        // Fall back to the original authentication methods
        console.log(chalk_1.default.gray('Falling back to alternative authentication methods...'));
        return await authenticateWithAllMethods(client, wallet);
    }
    catch (error) {
        // Check if the error is from a CAPTCHA challenge
        if (isCaptchaError(error)) {
            console.log(chalk_1.default.red('CAPTCHA challenge detected during authentication. Try using a different proxy.'));
        }
        else {
            console.log(chalk_1.default.red(`Authentication error: ${error.message}`));
        }
        return null;
    }
}
exports.authenticateWithPumpFun = authenticateWithPumpFun;
/**
 * Check if an error is related to CAPTCHA verification
 * @param error The error to check
 * @returns True if the error indicates CAPTCHA verification is required
 */
function isCaptchaError(error) {
    // Check response data
    if (error.response?.data && typeof error.response.data === 'string') {
        const content = error.response.data.toLowerCase();
        if (content.includes('captcha') ||
            content.includes('human verification') ||
            content.includes('awswaf')) {
            return true;
        }
    }
    // Check error message
    if (error.message && typeof error.message === 'string') {
        const message = error.message.toLowerCase();
        if (message.includes('captcha') ||
            message.includes('human verification') ||
            message.includes('bot detected')) {
            return true;
        }
    }
    return false;
}
