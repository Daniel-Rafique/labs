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
exports.setupProxyCommand = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const proxyManager_1 = require("../utils/proxyManager");
/**
 * Command to setup and configure proxies for the application
 */
async function setupProxyCommand(options = {}) {
    console.log(chalk_1.default.cyan('\n==== Proxy Configuration ===='));
    try {
        const proxyManager = (0, proxyManager_1.getProxyManager)();
        // Set default timeout and retries if not provided
        options.timeout = options.timeout || 30000; // 30 seconds default timeout
        options.retries = options.retries || 3; // 3 retries by default
        // If no specific options provided, prompt for proxy service
        if (!options.service) {
            const serviceAnswer = await inquirer_1.default.prompt([
                {
                    type: 'list',
                    name: 'service',
                    message: 'Which proxy service do you want to configure?',
                    choices: [
                        { name: 'Oxylabs Residential Proxies', value: 'oxylabs' },
                        { name: 'Manual Proxy Configuration', value: 'manual' },
                        { name: 'Disable Proxies', value: 'disable' }
                    ],
                    default: 'oxylabs'
                }
            ]);
            options.service = serviceAnswer.service;
        }
        // Prompt for advanced options if not headless
        if (!options.username && !options.password) {
            const advancedOptionsAnswer = await inquirer_1.default.prompt([
                {
                    type: 'confirm',
                    name: 'configureAdvanced',
                    message: 'Would you like to configure advanced proxy settings?',
                    default: false
                }
            ]);
            if (advancedOptionsAnswer.configureAdvanced) {
                const advancedOptions = await inquirer_1.default.prompt([
                    {
                        type: 'number',
                        name: 'timeout',
                        message: 'Connection timeout in milliseconds:',
                        default: options.timeout,
                        validate: (input) => {
                            return !isNaN(input) && input >= 5000 ? true : 'Timeout must be at least 5000ms (5 seconds)';
                        }
                    },
                    {
                        type: 'number',
                        name: 'retries',
                        message: 'Number of connection retries:',
                        default: options.retries,
                        validate: (input) => {
                            return !isNaN(input) && input >= 1 ? true : 'Must have at least 1 retry';
                        }
                    }
                ]);
                options.timeout = advancedOptions.timeout;
                options.retries = advancedOptions.retries;
            }
        }
        // Handle different proxy services
        switch (options.service) {
            case 'oxylabs':
                await setupOxylabs(proxyManager, options);
                break;
            case 'manual':
                await setupManualProxy(proxyManager, options);
                break;
            case 'disable':
                await disableProxies(proxyManager);
                break;
            default:
                console.log(chalk_1.default.yellow('Invalid proxy service selected'));
                break;
        }
        // Test proxy connection if requested
        if (options.test || (await shouldTestConnection())) {
            await testProxyConnection(proxyManager, options);
        }
        console.log(chalk_1.default.cyan('\n==== Proxy Setup Complete ===='));
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error setting up proxies: ${error.message}`));
    }
}
exports.setupProxyCommand = setupProxyCommand;
/**
 * Setup Oxylabs residential proxies
 */
async function setupOxylabs(proxyManager, options) {
    console.log(chalk_1.default.cyan('\nSetting up Oxylabs Residential Proxies'));
    console.log(chalk_1.default.blue('Oxylabs proxies provide rotating IPs from real residential devices'));
    let { username, password } = options;
    // Try to read from existing config if available
    if (!username || !password) {
        const configPath = path.join(process.cwd(), '.config', 'proxies.json');
        if (fs.existsSync(configPath)) {
            try {
                const existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (existingConfig && existingConfig.length > 0 &&
                    existingConfig[0].type === 'oxylabs' &&
                    existingConfig[0].auth &&
                    existingConfig[0].auth.username &&
                    existingConfig[0].auth.password) {
                    const useExistingConfig = await inquirer_1.default.prompt([
                        {
                            type: 'confirm',
                            name: 'useExisting',
                            message: 'Existing Oxylabs credentials found. Use these?',
                            default: true
                        }
                    ]);
                    if (useExistingConfig.useExisting) {
                        username = existingConfig[0].auth.username;
                        password = existingConfig[0].auth.password;
                        console.log(chalk_1.default.green('Using existing Oxylabs credentials'));
                    }
                }
            }
            catch (e) {
                // Ignore errors reading existing config
                console.log(chalk_1.default.yellow('Error reading existing config, will prompt for new credentials'));
            }
        }
    }
    // Prompt for credentials if not provided
    if (!username || !password) {
        const credentialsAnswers = await inquirer_1.default.prompt([
            {
                type: 'input',
                name: 'username',
                message: 'Enter your Oxylabs username (without the "customer-" prefix):',
                validate: (input) => {
                    return input.trim() !== '' ? true : 'Username is required';
                }
            },
            {
                type: 'password',
                name: 'password',
                message: 'Enter your Oxylabs password:',
                validate: (input) => {
                    return input.trim() !== '' ? true : 'Password is required';
                }
            }
        ]);
        username = credentialsAnswers.username;
        password = credentialsAnswers.password;
    }
    if (!username || !password) {
        throw new Error('Username and password are required for Oxylabs configuration');
    }
    // Configure Oxylabs proxies with timeout settings
    proxyManager.configureOxylabs(username, password, {
        timeout: options.timeout || 30000,
        retries: options.retries || 3,
        sessionDuration: 600 // 10 minute session duration for better stability
    });
    console.log(chalk_1.default.green('Oxylabs residential proxies configured successfully!'));
    console.log(chalk_1.default.blue(`Connection timeout set to ${options.timeout || 30000}ms with ${options.retries || 3} retries`));
}
/**
 * Setup manual proxy configuration
 */
async function setupManualProxy(proxyManager, options) {
    console.log(chalk_1.default.cyan('\nManual Proxy Configuration'));
    const proxyAnswers = await inquirer_1.default.prompt([
        {
            type: 'input',
            name: 'host',
            message: 'Enter proxy host:',
            validate: (input) => {
                return input.trim() !== '' ? true : 'Host is required';
            }
        },
        {
            type: 'number',
            name: 'port',
            message: 'Enter proxy port:',
            default: 8080,
            validate: (input) => {
                return !isNaN(input) && input > 0 && input <= 65535 ? true : 'Please enter a valid port number (1-65535)';
            }
        },
        {
            type: 'list',
            name: 'protocol',
            message: 'Select proxy protocol:',
            choices: ['http', 'https', 'socks5'],
            default: 'http'
        },
        {
            type: 'input',
            name: 'username',
            message: 'Enter proxy username (leave empty for no authentication):'
        },
        {
            type: 'password',
            name: 'password',
            message: 'Enter proxy password (leave empty for no authentication):'
        }
    ]);
    const proxyConfig = {
        host: proxyAnswers.host,
        port: proxyAnswers.port,
        username: proxyAnswers.username,
        password: proxyAnswers.password,
        protocol: proxyAnswers.protocol,
        timeout: options.timeout || 30000,
        retries: options.retries || 3
    };
    // Add the proxy configuration
    proxyManager.addProxy(proxyConfig);
    console.log(chalk_1.default.green('Manual proxy configuration added successfully!'));
    console.log(chalk_1.default.blue(`Connection timeout set to ${options.timeout || 30000}ms with ${options.retries || 3} retries`));
}
/**
 * Disable proxies
 */
async function disableProxies(proxyManager) {
    // Get current proxy configurations
    const configPath = path.join(process.cwd(), '.config', 'proxies.json');
    if (fs.existsSync(configPath)) {
        // Backup the proxies file
        const backupPath = `${configPath}.bak`;
        fs.copyFileSync(configPath, backupPath);
        // Create empty proxy config
        fs.writeFileSync(configPath, JSON.stringify([], null, 2));
        console.log(chalk_1.default.yellow('Proxies disabled. Previous configuration backed up to:'));
        console.log(chalk_1.default.yellow(backupPath));
    }
    else {
        console.log(chalk_1.default.yellow('No proxy configuration found to disable'));
    }
}
/**
 * Ask if user wants to test the proxy connection
 */
async function shouldTestConnection() {
    const testAnswer = await inquirer_1.default.prompt([
        {
            type: 'confirm',
            name: 'test',
            message: 'Would you like to test the proxy connection?',
            default: true
        }
    ]);
    return testAnswer.test;
}
/**
 * Test the proxy connection
 */
async function testProxyConnection(proxyManager, options = {}) {
    console.log(chalk_1.default.cyan('\nTesting proxy connection...'));
    if (!proxyManager.isEnabled()) {
        console.log(chalk_1.default.yellow('Proxy support is not enabled. Test skipped.'));
        return;
    }
    const spinner = (0, ora_1.default)('Connecting through proxy...').start();
    // Helper function to retry test
    const retryTest = async (testFn, maxRetries = options.retries || 3, delay = 2000) => {
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await testFn();
            }
            catch (error) {
                lastError = error;
                if (attempt < maxRetries) {
                    spinner.text = `Retry ${attempt}/${maxRetries}: ${error.message}`;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    // Increase delay for next retry
                    delay = Math.min(delay * 1.5, 10000);
                }
            }
        }
        throw lastError;
    };
    try {
        // Test the first connection with retries
        const result = await retryTest(() => proxyManager.testProxy());
        if (result.success && result.ip) {
            spinner.succeed(`Connected successfully through IP: ${result.ip}`);
            // Show additional connection info
            if (result.details) {
                console.log(chalk_1.default.blue(`Location: ${result.details.country || 'Unknown'}`));
                console.log(chalk_1.default.blue(`Provider: ${result.details.provider || 'Unknown'}`));
            }
            // Test connection to pump.fun specifically
            spinner.text = 'Testing connection to pump.fun API...';
            spinner.start();
            try {
                // Test connection to pump.fun API
                const apiResponse = await fetch('https://frontend-api-v3.pump.fun/health', {
                    // @ts-ignore
                    agent: proxyManager.getAxiosConfig().httpsAgent,
                    timeout: options.timeout || 30000
                });
                if (apiResponse.ok) {
                    spinner.succeed('Successfully connected to pump.fun API');
                }
                else {
                    spinner.warn(`Connected to pump.fun but received status ${apiResponse.status}`);
                }
            }
            catch (apiError) {
                spinner.warn(`Could not connect to pump.fun API: ${apiError.message}`);
                console.log(chalk_1.default.yellow('This may cause issues with profile creation and other API interactions'));
            }
            // Test rotation by testing a second connection
            spinner.text = 'Testing IP rotation...';
            spinner.start();
            // Rotate the proxy
            proxyManager.rotateProxy();
            // Test again with the new proxy
            const result2 = await retryTest(() => proxyManager.testProxy());
            if (result2.success && result2.ip) {
                if (result2.ip !== result.ip) {
                    spinner.succeed(`IP rotation successful! New IP: ${result2.ip}`);
                }
                else {
                    spinner.info(`Second connection used the same IP: ${result2.ip}`);
                    console.log(chalk_1.default.blue('Note: This is normal for some proxy configurations with sticky sessions.'));
                }
            }
            else {
                spinner.fail(`Failed to connect after rotation: ${result2.message}`);
            }
            // Suggest verifying Oxylabs credentials if appropriate
            if (options.service === 'oxylabs') {
                console.log(chalk_1.default.blue('Recommendation: If you continue to experience connection issues:'));
                console.log(chalk_1.default.blue('1. Verify your Oxylabs credentials at https://client.oxylabs.io/'));
                console.log(chalk_1.default.blue('2. Check if your subscription is active'));
                console.log(chalk_1.default.blue('3. Try using a country-specific proxy with the "country" parameter'));
            }
        }
        else {
            spinner.fail(`Proxy connection failed: ${result.message}`);
            console.log(chalk_1.default.yellow('Please check your proxy configuration and credentials.'));
            // Provide troubleshooting tips
            console.log(chalk_1.default.cyan('\nTroubleshooting tips:'));
            console.log(chalk_1.default.cyan('1. Verify your proxy credentials are correct'));
            console.log(chalk_1.default.cyan('2. Try increasing the connection timeout'));
            console.log(chalk_1.default.cyan('3. Check if your proxy service is operational'));
            console.log(chalk_1.default.cyan('4. Try a different proxy provider'));
        }
    }
    catch (error) {
        spinner.fail(`Error testing proxy: ${error.message}`);
        console.log(chalk_1.default.red('Proxy test failed after multiple retries.'));
    }
}
/**
 * Test country-specific proxy connection
 */
async function testCountrySpecificProxy(proxyManager, country) {
    try {
        const config = proxyManager.getAxiosConfig(country);
        const response = await fetch('https://ip.oxylabs.io/location', {
            // @ts-ignore - the node-fetch types are a bit different
            agent: config.httpsAgent,
            timeout: 30000 // Use longer timeout for location-specific connections
        });
        if (!response.ok) {
            return {
                success: false,
                message: `Failed to connect to ${country} proxy: HTTP ${response.status}`
            };
        }
        const data = await response.json();
        if (data && data.country) {
            // Check if the returned country matches or is close to what we requested
            // Note: Exact matching might not always be possible with residential proxies
            if (data.country.toLowerCase() === country.toLowerCase() ||
                data.country_code.toLowerCase() === country.toLowerCase()) {
                return {
                    success: true,
                    message: `Successfully connected through ${country} proxy: ${data.ip} (${data.country})`
                };
            }
            else {
                return {
                    success: false,
                    message: `Requested ${country} but got ${data.country} (${data.ip})`
                };
            }
        }
        else {
            return {
                success: false,
                message: `Connected but couldn't verify country: ${JSON.stringify(data)}`
            };
        }
    }
    catch (error) {
        return {
            success: false,
            message: `Error testing country-specific proxy: ${error.message}`
        };
    }
}
