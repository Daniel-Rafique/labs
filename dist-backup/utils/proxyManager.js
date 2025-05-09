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
exports.getProxyManager = exports.generateSessionParams = exports.ProxyManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
const https_proxy_agent_1 = require("https-proxy-agent");
const socks_proxy_agent_1 = require("socks-proxy-agent");
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
/**
 * Proxy Manager to handle residential proxies
 * Optimized for Oxylabs residential proxies
 */
class ProxyManager {
    constructor(configPath) {
        this.proxyConfigs = [];
        this.currentProxy = 0;
        this.enabled = false;
        this.lastIpCheck = {};
        // Set default config path if not provided
        this.configPath = configPath || path.join(process.cwd(), '.config', 'proxies.json');
        this.loadProxyConfigs();
    }
    /**
     * Load proxy configurations from file
     */
    loadProxyConfigs() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                const configs = JSON.parse(data);
                if (Array.isArray(configs) && configs.length > 0) {
                    this.proxyConfigs = configs;
                    this.enabled = true;
                    console.log(chalk_1.default.green(`Loaded ${this.proxyConfigs.length} proxy configurations`));
                }
                else {
                    console.log(chalk_1.default.yellow('No proxy configurations found in config file'));
                }
            }
            else {
                console.log(chalk_1.default.yellow(`Proxy config file not found at ${this.configPath}`));
                // Create default config with placeholder
                this.createDefaultConfig();
            }
        }
        catch (error) {
            console.error(chalk_1.default.red(`Error loading proxy configurations: ${error.message}`));
        }
    }
    /**
     * Create a default proxy configuration file
     */
    createDefaultConfig() {
        try {
            // Create directory if it doesn't exist
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            // Sample configuration for Oxylabs
            const sampleConfig = [
                {
                    host: 'pr.oxylabs.io',
                    port: 7777,
                    username: 'customer-USERNAME',
                    password: 'PASSWORD',
                    protocol: 'http'
                }
            ];
            fs.writeFileSync(this.configPath, JSON.stringify(sampleConfig, null, 2));
            console.log(chalk_1.default.blue(`Created sample proxy configuration at ${this.configPath}`));
            console.log(chalk_1.default.yellow('Please update with your actual Oxylabs proxy credentials'));
        }
        catch (error) {
            console.error(chalk_1.default.red(`Error creating default proxy configuration: ${error.message}`));
        }
    }
    /**
     * Save current proxy configurations to file
     */
    saveProxyConfigs() {
        try {
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.configPath, JSON.stringify(this.proxyConfigs, null, 2));
            console.log(chalk_1.default.green(`Saved ${this.proxyConfigs.length} proxy configurations to ${this.configPath}`));
        }
        catch (error) {
            console.error(chalk_1.default.red(`Error saving proxy configurations: ${error.message}`));
        }
    }
    /**
     * Check if proxy support is enabled and configured
     */
    isEnabled() {
        return this.enabled && this.proxyConfigs.length > 0;
    }
    /**
     * Add a new proxy configuration
     */
    addProxy(config) {
        this.proxyConfigs.push(config);
        this.enabled = true;
        this.saveProxyConfigs();
    }
    /**
     * Remove a proxy configuration
     */
    removeProxy(index) {
        if (index >= 0 && index < this.proxyConfigs.length) {
            this.proxyConfigs.splice(index, 1);
            if (this.proxyConfigs.length === 0) {
                this.enabled = false;
            }
            this.saveProxyConfigs();
            return true;
        }
        return false;
    }
    /**
     * Get the current proxy configuration
     */
    getCurrentProxy() {
        if (!this.isEnabled())
            return null;
        return this.proxyConfigs[this.currentProxy];
    }
    /**
     * Rotate to the next proxy
     */
    rotateProxy() {
        if (!this.isEnabled())
            return null;
        this.currentProxy = (this.currentProxy + 1) % this.proxyConfigs.length;
        return this.getCurrentProxy();
    }
    /**
     * Get an Axios request config with proxy settings
     * Optionally specify country, city, or session parameters
     */
    getAxiosConfig(country, city, sessionId) {
        const config = {};
        if (!this.isEnabled())
            return config;
        const proxy = this.getCurrentProxy();
        if (!proxy)
            return config;
        // Copy the proxy config so we don't modify the original
        const proxyConfig = { ...proxy };
        try {
            // Focus on optimizing for Oxylabs - add parameters to username
            let modifiedUsername = proxyConfig.username;
            // Add country if specified
            if (country) {
                modifiedUsername += `-cc-${country.toUpperCase()}`;
            }
            else {
                // Default to US if no country specified (most reliable for pump.fun)
                modifiedUsername += `-cc-US`;
            }
            // Add city if specified
            if (city) {
                modifiedUsername += `-city-${city.toLowerCase()}`;
            }
            // Add session ID if specified or generate a random one to avoid rate limiting
            // Always ensure there's a session ID, never use undefined
            if (sessionId) {
                // Use provided session ID
                modifiedUsername += `-sessid-${sessionId}`;
            }
            else {
                // Generate random session ID to avoid reusing the same IP
                const randomSessionId = Math.floor(Math.random() * 1000000).toString();
                modifiedUsername += `-sessid-${randomSessionId}`;
                // Log that we're using a generated session ID
                console.log(chalk_1.default.gray(`Using generated session ID: ${randomSessionId}`));
            }
            proxyConfig.username = modifiedUsername;
            // Create properly encoded proxy URL
            try {
                // Ensure username and password are properly encoded
                const encodedUsername = encodeURIComponent(proxyConfig.username);
                const encodedPassword = encodeURIComponent(proxyConfig.password);
                // Use proper URL formatting with encoding
                const proxyUrl = `${proxyConfig.protocol}://${encodedUsername}:${encodedPassword}@${proxyConfig.host}:${proxyConfig.port}`;
                // Create agent and add to config
                if (proxyConfig.protocol === 'socks5') {
                    config.httpsAgent = new socks_proxy_agent_1.SocksProxyAgent(proxyUrl);
                    config.httpAgent = config.httpsAgent;
                }
                else {
                    config.httpsAgent = new https_proxy_agent_1.HttpsProxyAgent(proxyUrl);
                    config.httpAgent = config.httpsAgent;
                }
            }
            catch (error) {
                console.error(chalk_1.default.red(`Error creating proxy URL: ${error instanceof Error ? error.message : String(error)}`));
                // Fallback to manual agent creation if URL encoding fails
                if (proxyConfig.protocol === 'socks5') {
                    // Build the URL manually without using encodeURIComponent
                    const socksUrl = `socks5://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;
                    config.httpsAgent = new socks_proxy_agent_1.SocksProxyAgent(socksUrl);
                }
                else {
                    // Build the URL manually without using encodeURIComponent
                    const httpUrl = `${proxyConfig.protocol}://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;
                    config.httpsAgent = new https_proxy_agent_1.HttpsProxyAgent(httpUrl);
                }
                config.httpAgent = config.httpsAgent;
            }
        }
        catch (error) {
            console.error(chalk_1.default.red(`Error in getAxiosConfig: ${error instanceof Error ? error.message : String(error)}`));
        }
        return config;
    }
    /**
     * Get a proxy URL string for use with other libraries
     */
    getProxyUrl(country, city, sessionId) {
        if (!this.isEnabled())
            return null;
        const proxy = this.getCurrentProxy();
        if (!proxy)
            return null;
        try {
            // Copy the proxy config so we don't modify the original
            const proxyConfig = { ...proxy };
            // Focus on optimizing for Oxylabs - add parameters to username
            let modifiedUsername = proxyConfig.username;
            // Add country if specified
            if (country) {
                modifiedUsername += `-cc-${country.toUpperCase()}`;
            }
            else {
                // Default to US if no country specified (most reliable for pump.fun)
                modifiedUsername += `-cc-US`;
            }
            // Add city if specified
            if (city) {
                modifiedUsername += `-city-${city.toLowerCase()}`;
            }
            // Add session ID if specified or generate a random one to avoid rate limiting
            if (sessionId) {
                // Use provided session ID
                modifiedUsername += `-sessid-${sessionId}`;
            }
            else {
                // Generate random session ID to avoid reusing the same IP
                const randomSessionId = Math.floor(Math.random() * 1000000).toString();
                modifiedUsername += `-sessid-${randomSessionId}`;
            }
            proxyConfig.username = modifiedUsername;
            // Ensure username and password are properly encoded
            const encodedUsername = encodeURIComponent(proxyConfig.username);
            const encodedPassword = encodeURIComponent(proxyConfig.password);
            // Return properly formatted URL string with encoding
            return `${proxyConfig.protocol}://${encodedUsername}:${encodedPassword}@${proxyConfig.host}:${proxyConfig.port}`;
        }
        catch (error) {
            console.error(chalk_1.default.red(`Error in getProxyUrl: ${error instanceof Error ? error.message : String(error)}`));
            return null;
        }
    }
    /**
     * Test the current proxy connection
     */
    async testProxy() {
        if (!this.isEnabled()) {
            return {
                success: false,
                ip: null,
                message: 'Proxy support is not enabled'
            };
        }
        const spinner = (0, ora_1.default)('Testing Oxylabs proxy connection...').start();
        try {
            // Generate a unique session ID for this test
            const sessionId = `test-${Math.floor(Math.random() * 1000000)}`;
            // Get config with US country and test session ID
            const proxyConfig = this.getAxiosConfig('US', undefined, sessionId);
            try {
                const response = await axios_1.default.get('https://ip.oxylabs.io/location', proxyConfig);
                if (response.status === 200 && response.data) {
                    spinner.succeed(`Oxylabs proxy connection successful: ${response.data.ip}`);
                    return {
                        success: true,
                        ip: response.data.ip,
                        message: `Connected through ${response.data.country}`
                    };
                }
                else {
                    spinner.fail('Proxy connection failed: Unknown error');
                    return {
                        success: false,
                        ip: null,
                        message: 'Unknown error'
                    };
                }
            }
            catch (error) {
                // Try alternative lookup service if Oxylabs one fails
                try {
                    spinner.text = 'Trying alternative IP lookup service...';
                    const altResponse = await axios_1.default.get('https://api.ipify.org?format=json', proxyConfig);
                    if (altResponse.status === 200 && altResponse.data && altResponse.data.ip) {
                        spinner.succeed(`Proxy connection successful: ${altResponse.data.ip}`);
                        return {
                            success: true,
                            ip: altResponse.data.ip,
                            message: `Connected successfully`
                        };
                    }
                }
                catch (altError) {
                    // Continue to the error handling below
                }
                spinner.fail(`Proxy connection failed: ${error.message}`);
                return {
                    success: false,
                    ip: null,
                    message: error.message
                };
            }
        }
        catch (error) {
            spinner.fail(`Error setting up proxy test: ${error.message}`);
            return {
                success: false,
                ip: null,
                message: error.message
            };
        }
    }
    /**
     * Configure Oxylabs residential proxy
     */
    configureOxylabs(username, password, options) {
        // Ensure username doesn't already have customer- prefix
        const cleanUsername = username.startsWith('customer-') ? username.substring(9) : username;
        const oxyConfig = {
            host: 'pr.oxylabs.io',
            port: 7777,
            username: `customer-${cleanUsername}`,
            password: password,
            protocol: 'http'
        };
        // Check if we already have an Oxylabs configuration
        const existingIndex = this.proxyConfigs.findIndex(config => config.host === 'pr.oxylabs.io');
        if (existingIndex >= 0) {
            this.proxyConfigs[existingIndex] = oxyConfig;
        }
        else {
            this.proxyConfigs.push(oxyConfig);
        }
        this.enabled = true;
        this.saveProxyConfigs();
        console.log(chalk_1.default.green('Oxylabs residential proxy configured successfully'));
    }
    /**
     * Check if current IP has been used recently
     * Returns true if IP is considered "fresh" (not used recently)
     */
    async checkIpFreshness(identifier = 'default') {
        if (!this.isEnabled())
            return true;
        try {
            const currentTime = Date.now();
            const reusePeriod = 30 * 60 * 1000; // 30 minutes
            // If we've checked this identifier recently and it's still fresh
            if (this.lastIpCheck[identifier] &&
                (currentTime - this.lastIpCheck[identifier].timestamp < reusePeriod)) {
                return true;
            }
            // Test the proxy to get current IP
            const result = await this.testProxy();
            if (!result.success || !result.ip) {
                // If test failed, rotate and try again
                this.rotateProxy();
                return false;
            }
            // Check if this IP has been used for this identifier
            if (this.lastIpCheck[identifier] &&
                this.lastIpCheck[identifier].ip === result.ip) {
                // IP has been used for this identifier, rotate
                this.rotateProxy();
                return false;
            }
            // Update our record for this identifier
            this.lastIpCheck[identifier] = {
                ip: result.ip,
                timestamp: currentTime
            };
            return true;
        }
        catch (error) {
            // If there's an error, rotate and try again
            this.rotateProxy();
            return false;
        }
    }
    /**
     * Ensure a fresh IP for an operation
     * Keeps rotating proxies until a fresh IP is found
     */
    async ensureFreshIp(identifier = 'default', maxAttempts = 5) {
        if (!this.isEnabled())
            return true;
        let attempts = 0;
        let fresh = false;
        while (!fresh && attempts < maxAttempts) {
            fresh = await this.checkIpFreshness(identifier);
            if (!fresh) {
                this.rotateProxy();
                attempts++;
            }
        }
        return fresh;
    }
    /**
     * Get statistics about proxy usage for reporting
     */
    getProxyStats() {
        if (!this.isEnabled() || this.proxyConfigs.length === 0) {
            return [];
        }
        // For now we just return basic info about the configured proxies
        return this.proxyConfigs.map(config => {
            // Build a masked URL for display
            const maskedUrl = `${config.protocol}://***:***@${config.host}:${config.port}`;
            return {
                url: maskedUrl,
                successCount: 0,
                failureCount: 0,
                isBanned: false
            };
        });
    }
}
exports.ProxyManager = ProxyManager;
/**
 * Generate natural-looking session parameters for proxy connections
 * Randomizes session ID and duration to make connections appear more organic
 */
function generateSessionParams(minDuration = 10, maxDuration = 30) {
    // Generate a random session ID
    const sessionId = Math.floor(Math.random() * 1000000000).toString();
    // Random session time between min and max minutes for more natural behavior
    const sessionTime = Math.floor(Math.random() * (maxDuration - minDuration + 1)) + minDuration;
    // Create formatted string for use in proxy connections
    const formattedString = `-sessid-${sessionId}-sesstime-${sessionTime}`;
    return {
        sessionId,
        sessionTime,
        formattedString
    };
}
exports.generateSessionParams = generateSessionParams;
/**
 * Create a proxy manager singleton instance
 */
let proxyManagerInstance = null;
function getProxyManager() {
    if (!proxyManagerInstance) {
        proxyManagerInstance = new ProxyManager();
    }
    return proxyManagerInstance;
}
exports.getProxyManager = getProxyManager;
