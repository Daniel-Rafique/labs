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
exports.startBotCommand = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));
const web3_js_1 = require("@solana/web3.js");
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const child_process_1 = require("child_process");
const wallet_1 = require("../utils/wallet");
const openai_1 = __importDefault(require("openai"));
const axios_1 = __importDefault(require("axios"));
const proxyManager_1 = require("../utils/proxyManager");
async function startBotCommand(options) {
    try {
        // Process options and prompt for missing ones
        const { contract, maxAmount, minAmount, timeBetween, jito, numBuys, directory, numCycles, useAi, useProxies } = await processBotOptions(options);
        // Get project root directory
        const projectRootDir = path.resolve(__dirname, '../../');
        // Determine wallet path
        const walletPath = (0, wallet_1.resolveWalletPath)(directory || 'user', !jito);
        // Create/update .env file
        const envVars = {
            CONTRACT_ADDRESS: contract,
            TOKEN_MINT_ADDRESS: contract,
            TOKEN_SYMBOL: 'TOKEN',
            MAX_TRADE_AMOUNT: maxAmount,
            MIN_TRADE_AMOUNT: minAmount,
            TIME_BETWEEN_BUYS: timeBetween,
            NUMBER_OF_BUYS: numBuys,
            NUMBER_OF_CYCLES: numCycles,
            JITO: jito ? 'true' : 'false',
            ENABLE_TRADING: 'true',
            TRADE_TYPE: 'sol_spl',
            USE_AI_OPTIMIZATION: useAi ? 'true' : 'false',
            USE_PROXIES: useProxies ? 'true' : 'false'
        };
        // Create .env file at the project root
        const envFilePath = path.join(projectRootDir, '.env');
        await updateEnvFile(envFilePath, envVars);
        // Confirm bot settings before starting
        console.log(chalk_1.default.cyan('\n====== BOT SETTINGS ======'));
        console.log(chalk_1.default.green(`Contract Address: ${contract}`));
        console.log(chalk_1.default.green(`Max Trade Amount: ${maxAmount} SOL`));
        console.log(chalk_1.default.green(`Min Trade Amount: ${minAmount} SOL`));
        console.log(chalk_1.default.green(`Time Between Buys: ${timeBetween}ms`));
        console.log(chalk_1.default.green(`Number of Buys: ${numBuys}`));
        console.log(chalk_1.default.green(`Number of Cycles: ${numCycles}`));
        console.log(chalk_1.default.green(`Mode: ${jito ? 'JITO' : 'Lightning/Bump'}`));
        console.log(chalk_1.default.green(`Wallet File: ${walletPath}`));
        console.log(chalk_1.default.green(`AI Optimization: ${useAi ? 'Enabled' : 'Disabled'}`));
        console.log(chalk_1.default.green(`Proxy Support: ${useProxies ? 'Enabled' : 'Disabled'}`));
        console.log(chalk_1.default.cyan('==========================\n'));
        const confirm = await inquirer_1.default.prompt([
            {
                type: 'confirm',
                name: 'proceed',
                message: 'Do you want to start the bot with these settings?',
                default: false
            }
        ]);
        if (!confirm.proceed) {
            console.log(chalk_1.default.yellow('Bot startup cancelled.'));
            return;
        }
        // Start the bot
        const spinner = (0, ora_1.default)('Starting bot...').start();
        try {
            const botPath = path.join(projectRootDir, 'dist', 'bot.js');
            // Check if the bot.js file exists
            if (!fs.existsSync(botPath)) {
                spinner.fail('Bot file not found at ' + botPath);
                return;
            }
            // Run the bot as a detached process
            const botProcess = (0, child_process_1.exec)(`node ${botPath}`, (error, stdout, stderr) => {
                if (error) {
                    spinner.fail(`Error starting bot: ${error.message}`);
                    console.error(chalk_1.default.red('Bot execution error:'), error);
                    return;
                }
            });
            // Set up flag to track if we've shown the wallet balance error
            let balanceErrorShown = false;
            // Create a function to display the wallet balance error menu
            const showWalletBalanceErrorMenu = (minRequired = minAmount) => {
                if (balanceErrorShown)
                    return; // Prevent showing multiple times
                balanceErrorShown = true;
                spinner.fail('Bot could not start due to insufficient wallet balance');
                console.log(chalk_1.default.red('\n========================================'));
                console.log(chalk_1.default.red('⚠️  INSUFFICIENT WALLET BALANCE DETECTED  ⚠️'));
                console.log(chalk_1.default.red('========================================'));
                console.log(chalk_1.default.yellow(`None of your wallets have sufficient SOL balance to trade.`));
                console.log(chalk_1.default.yellow(`Minimum required: ${minRequired} SOL per wallet\n`));
                // Stop the bot process since it can't continue
                if (botProcess.pid) {
                    try {
                        process.kill(botProcess.pid);
                    }
                    catch (e) {
                        // Ignore kill errors
                    }
                }
                // Show interactive prompt for what to do next
                inquirer_1.default.prompt([
                    {
                        type: 'list',
                        name: 'action',
                        message: 'What would you like to do?',
                        choices: [
                            { name: 'Distribute SOL between wallets', value: 'distribute' },
                            { name: 'Return to main menu', value: 'menu' }
                        ]
                    }
                ]).then(response => {
                    if (response.action === 'distribute') {
                        console.log(chalk_1.default.cyan('\nLaunching SOL distribution tool...\n'));
                        // Import and run the distribute command
                        Promise.resolve().then(() => __importStar(require('../commands/distribute'))).then(module => {
                            module.distributeCommand({
                                directory: directory || '.config',
                                amount: '0.01' // Default minimal amount
                            }).catch(err => {
                                console.error(chalk_1.default.red(`\nError during SOL distribution: ${err.message}`));
                            });
                        });
                    }
                    else {
                        console.log(chalk_1.default.cyan('\nReturning to main menu. Please fund your wallets and try again.'));
                    }
                });
            };
            // Function to check error log files for balance issues
            const checkErrorLogs = () => {
                try {
                    // Check for special error log file
                    const errorLogPath = path.join(projectRootDir, 'logs', 'wallet_error.log');
                    if (fs.existsSync(errorLogPath)) {
                        const logContent = fs.readFileSync(errorLogPath, 'utf8');
                        // Check if log is from today
                        const today = new Date().toISOString().slice(0, 10);
                        if (logContent.includes(today) &&
                            (logContent.includes('INSUFFICIENT_WALLET_BALANCE') ||
                                logContent.includes('insufficient wallet balance'))) {
                            // Try to extract the minimum amount
                            const match = logContent.match(/Minimum required: ([0-9.]+) SOL/);
                            const minRequired = match ? match[1] : minAmount;
                            showWalletBalanceErrorMenu(minRequired);
                            return true;
                        }
                    }
                    // Check regular bot logs
                    const logsDir = path.join(projectRootDir, 'logs');
                    if (fs.existsSync(logsDir)) {
                        const logFiles = fs.readdirSync(logsDir)
                            .filter(file => file.startsWith('bot_'))
                            .map(file => ({
                            path: path.join(logsDir, file),
                            mtime: fs.statSync(path.join(logsDir, file)).mtime.getTime()
                        }))
                            .sort((a, b) => b.mtime - a.mtime); // Most recent first
                        if (logFiles.length > 0) {
                            const recentLog = fs.readFileSync(logFiles[0].path, 'utf8');
                            if (recentLog.includes('INSUFFICIENT_WALLET_BALANCE') ||
                                recentLog.includes('insufficient wallet balance') ||
                                recentLog.includes('WARNING: INSUFFICIENT WALLET BALANCE')) {
                                // Try to extract the minimum amount
                                const match = recentLog.match(/Minimum required: ([0-9.]+) SOL/);
                                const minRequired = match ? match[1] : minAmount;
                                showWalletBalanceErrorMenu(minRequired);
                                return true;
                            }
                        }
                    }
                    return false;
                }
                catch (err) {
                    console.error(chalk_1.default.gray('Error checking log files:'), err);
                    return false;
                }
            };
            // Handle stdout data
            botProcess.stdout?.on('data', (data) => {
                spinner.stop();
                const output = data.toString().trim();
                // Check if this is the insufficient balance warning
                if (output.includes('insufficient wallet balance') ||
                    output.includes('INSUFFICIENT WALLET BALANCE') ||
                    output.includes('INSUFFICIENT_WALLET_BALANCE')) {
                    // Extract the minimum SOL requirement if possible
                    const match = output.match(/Minimum required: ([0-9.]+) SOL/);
                    const minRequired = match ? match[1] : minAmount;
                    showWalletBalanceErrorMenu(minRequired);
                    return;
                }
                console.log(chalk_1.default.blue('[BOT]'), output);
            });
            // Handle stderr data
            botProcess.stderr?.on('data', (data) => {
                spinner.stop();
                const output = data.toString().trim();
                // Check if this is the insufficient balance error in stderr
                if (output.includes('insufficient wallet balance') ||
                    output.includes('INSUFFICIENT WALLET BALANCE') ||
                    output.includes('INSUFFICIENT_WALLET_BALANCE')) {
                    // Extract the minimum SOL requirement if possible
                    const match = output.match(/Minimum required: ([0-9.]+) SOL/);
                    const minRequired = match ? match[1] : minAmount;
                    showWalletBalanceErrorMenu(minRequired);
                    return;
                }
                console.error(chalk_1.default.red('[BOT ERROR]'), output);
            });
            // Add an exit handler to check for error conditions
            botProcess.on('exit', (code, signal) => {
                // If the process exited with a non-zero code and we haven't already shown an error message
                if (code !== 0 && !balanceErrorShown) {
                    // Check for errors in log files
                    if (!checkErrorLogs()) {
                        spinner.fail(`Bot process exited with code ${code}`);
                        console.log(chalk_1.default.yellow('\nThe bot exited unexpectedly. This could be due to insufficient wallet balance.'));
                        console.log(chalk_1.default.yellow('Please check that your wallets have enough SOL and try again.'));
                    }
                }
            });
            // Set up periodic log checking
            const logCheckInterval = setInterval(() => {
                if (!balanceErrorShown) {
                    checkErrorLogs();
                }
            }, 2000); // Check every 2 seconds
            // Clear log check interval after 30 seconds
            setTimeout(() => {
                clearInterval(logCheckInterval);
            }, 30000);
            // Notify user when bot has started
            setTimeout(() => {
                if (spinner.isSpinning && !balanceErrorShown) { // Only update if we haven't shown an error already
                    spinner.succeed('Bot started successfully!');
                    console.log(chalk_1.default.green('\nBot is now running in the background.'));
                    console.log(chalk_1.default.yellow('Press Ctrl+C to stop the CLI, but the bot will continue running.'));
                    console.log(chalk_1.default.yellow('To stop the bot, you will need to terminate it manually using task manager or the kill command.'));
                }
            }, 3000);
        }
        catch (error) {
            spinner.fail(`Failed to start bot: ${error.message}`);
            console.error(chalk_1.default.red('Bot startup error:'), error);
        }
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error in startBot command: ${error.message}`));
    }
}
exports.startBotCommand = startBotCommand;
/**
 * Fetches token information from DexScreener or other sources
 * @param tokenAddress The token's contract address
 * @returns TokenInfo object with available data
 */
async function fetchTokenInfo(tokenAddress) {
    const tokenInfo = {};
    const spinner = (0, ora_1.default)('Fetching token information...').start();
    try {
        // Try DexScreener API first
        const dexScreenerUrl = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
        const response = await axios_1.default.get(dexScreenerUrl, { timeout: 10000 });
        if (response.data && response.data.pairs && response.data.pairs.length > 0) {
            const pair = response.data.pairs[0];
            tokenInfo.symbol = pair.baseToken.symbol;
            tokenInfo.name = pair.baseToken.name;
            tokenInfo.price = parseFloat(pair.priceUsd);
            tokenInfo.liquidity = parseFloat(pair.liquidity.usd);
            tokenInfo.volume24h = parseFloat(pair.volume.h24);
            // Calculate approximate age based on pair creation time
            if (pair.createAt) {
                const creationTime = new Date(pair.createAt).getTime();
                const now = Date.now();
                tokenInfo.age = Math.floor((now - creationTime) / (1000 * 60 * 60 * 24));
            }
            spinner.succeed(`Token information fetched successfully: ${tokenInfo.name} (${tokenInfo.symbol})`);
        }
        else {
            spinner.warn('No trading pairs found for this token on DexScreener');
        }
    }
    catch (error) {
        spinner.warn(`Error fetching token data: ${error.message}`);
    }
    return tokenInfo;
}
/**
 * Use AI to recommend optimal trading parameters based on token information
 * @param tokenAddress The token's contract address
 * @param tokenInfo Information about the token
 * @param jito Whether JITO mode is enabled
 * @returns Recommended trading parameters
 */
async function getAIRecommendedParams(tokenAddress, tokenInfo, jito) {
    const spinner = (0, ora_1.default)('Using AI to optimize trading parameters...').start();
    try {
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) {
            spinner.fail('OpenAI API key not found. Please set OPENAI_API_KEY in your .env file.');
            return null;
        }
        const openai = new openai_1.default({
            apiKey: openaiKey
        });
        const tokenDescription = tokenInfo.name
            ? `${tokenInfo.name} (${tokenInfo.symbol})`
            : `Token at address ${tokenAddress}`;
        let promptContent = `You are an expert crypto trading bot optimizer. I need optimal parameters for a Solana token trading bot.

Token: ${tokenDescription}
${tokenInfo.price ? `Current Price: $${tokenInfo.price}` : ''}
${tokenInfo.liquidity ? `Liquidity: $${tokenInfo.liquidity}` : ''}
${tokenInfo.volume24h ? `24h Volume: $${tokenInfo.volume24h}` : ''}
${tokenInfo.age ? `Token Age: ${tokenInfo.age} days` : ''}
Trading Mode: ${jito ? 'JITO (MEV protection)' : 'Lightning/Bump (fastest execution)'}

Based on these token characteristics, suggest optimal values for:
1. Max Trade Amount (in SOL)
2. Min Trade Amount (in SOL)
3. Time Between Buys (in milliseconds)
4. Number of Buys before selling
5. Number of Cycles to perform

For each parameter, provide a specific value (not a range) that is optimal for this token. Explain your reasoning for these recommendations.

Format your response as a JSON object with these fields:
{
  "maxAmount": "value",
  "minAmount": "value",
  "timeBetween": "value",
  "numBuys": "value",
  "numCycles": "value",
  "reasoning": "brief explanation"
}`;
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are an expert crypto trading bot optimizer that provides precise parameter recommendations based on token data." },
                { role: "user", content: promptContent }
            ],
            temperature: 0.3,
            response_format: { type: "json_object" }
        });
        const content = response.choices[0].message.content;
        if (!content) {
            spinner.fail('Failed to get AI recommendations: Empty response');
            return null;
        }
        try {
            const recommendations = JSON.parse(content);
            spinner.succeed('AI trading parameter optimization complete');
            return recommendations;
        }
        catch (parseError) {
            spinner.fail(`Failed to parse AI recommendations: ${parseError}`);
            return null;
        }
    }
    catch (error) {
        spinner.fail(`AI optimization error: ${error.message}`);
        return null;
    }
}
// Process and validate bot options
async function processBotOptions(options) {
    let { contract, maxAmount = '0.005', minAmount = '0.0005', timeBetween = '5000', jito = false, numBuys = '3', directory = 'user', numCycles = '1', useAi = false, useProxies = false } = options;
    // Handle contract address
    if (!contract) {
        const contractAnswer = await inquirer_1.default.prompt([
            {
                type: 'input',
                name: 'contract',
                message: 'Enter contract address:',
                validate: (input) => {
                    try {
                        new web3_js_1.PublicKey(input);
                        return true;
                    }
                    catch (e) {
                        return 'Please enter a valid Solana address';
                    }
                }
            }
        ]);
        contract = contractAnswer.contract;
    }
    // Handle trading mode
    const modeAnswer = await inquirer_1.default.prompt([
        {
            type: 'confirm',
            name: 'jito',
            message: 'Use JITO mode (instead of Lightning/Bump)?',
            default: jito
        }
    ]);
    jito = modeAnswer.jito;
    // Ask if user wants to use AI for parameter optimization
    const aiOptimizationAnswer = await inquirer_1.default.prompt([
        {
            type: 'confirm',
            name: 'useAi',
            message: 'Use AI to optimize trading parameters?',
            default: useAi
        }
    ]);
    useAi = aiOptimizationAnswer.useAi;
    // Check for proxy configuration and ask if user wants to use proxies
    const proxyManager = (0, proxyManager_1.getProxyManager)();
    const proxiesConfigured = proxyManager.isEnabled();
    if (proxiesConfigured) {
        const proxyAnswer = await inquirer_1.default.prompt([
            {
                type: 'confirm',
                name: 'useProxies',
                message: 'Use residential proxies for trades (recommended)?',
                default: true
            }
        ]);
        useProxies = proxyAnswer.useProxies;
        // If user wants to use proxies but they're not configured, ask if they want to set them up
        if (useProxies && !proxiesConfigured) {
            console.log(chalk_1.default.yellow('Proxies not yet configured.'));
            const setupAnswer = await inquirer_1.default.prompt([
                {
                    type: 'confirm',
                    name: 'setupNow',
                    message: 'Would you like to set up proxies now?',
                    default: true
                }
            ]);
            if (setupAnswer.setupNow) {
                // Import and run the proxy setup command
                const { setupProxyCommand } = require('./setupProxy');
                await setupProxyCommand({ service: 'oxylabs' });
                // Check again if proxies are configured
                if (proxyManager.isEnabled()) {
                    useProxies = true;
                }
                else {
                    useProxies = false;
                    console.log(chalk_1.default.yellow('Continuing without proxies.'));
                }
            }
            else {
                useProxies = false;
                console.log(chalk_1.default.yellow('Continuing without proxies.'));
            }
        }
    }
    // If AI optimization is selected, fetch token info and get recommendations
    if (useAi) {
        // Check for OpenAI API key
        if (!process.env.OPENAI_API_KEY) {
            console.log(chalk_1.default.yellow('OpenAI API key not found in environment variables.'));
            const { openaiKey, saveKey } = await inquirer_1.default.prompt([
                {
                    type: 'input',
                    name: 'openaiKey',
                    message: 'Enter your OpenAI API key:',
                    validate: (input) => {
                        if (!input)
                            return 'OpenAI API key is required for AI optimization';
                        return true;
                    }
                },
                {
                    type: 'confirm',
                    name: 'saveKey',
                    message: 'Save this API key for future use?',
                    default: true
                }
            ]);
            // Save API key if requested
            if (saveKey) {
                process.env.OPENAI_API_KEY = openaiKey;
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
                    envContent = envContent.replace(openAiKeyRegex, `OPENAI_API_KEY=${openaiKey}`);
                }
                else {
                    // Add OPENAI_API_KEY if it doesn't exist
                    envContent += `\nOPENAI_API_KEY=${openaiKey}\n`;
                }
                // Write updated content back to file
                fs.writeFileSync(envPath, envContent);
                console.log(chalk_1.default.green('✓ OpenAI API key saved to .env file'));
            }
            else {
                process.env.OPENAI_API_KEY = openaiKey;
            }
        }
        // Fetch token information
        const tokenInfo = await fetchTokenInfo(contract);
        // Get AI parameter recommendations
        const aiParams = await getAIRecommendedParams(contract, tokenInfo, jito);
        if (aiParams) {
            // Show AI recommendations
            console.log(chalk_1.default.cyan('\n====== AI RECOMMENDED PARAMETERS ======'));
            console.log(chalk_1.default.green(`Max Trade Amount: ${aiParams.maxAmount} SOL`));
            console.log(chalk_1.default.green(`Min Trade Amount: ${aiParams.minAmount} SOL`));
            console.log(chalk_1.default.green(`Time Between Buys: ${aiParams.timeBetween}ms`));
            console.log(chalk_1.default.green(`Number of Buys: ${aiParams.numBuys}`));
            console.log(chalk_1.default.green(`Number of Cycles: ${aiParams.numCycles}`));
            console.log(chalk_1.default.cyan('======================================'));
            console.log(chalk_1.default.blue('AI Reasoning:'));
            console.log(chalk_1.default.blue(aiParams.reasoning));
            console.log(chalk_1.default.cyan('======================================\n'));
            // Ask if user wants to use AI recommendations
            const { useRecommendations } = await inquirer_1.default.prompt([
                {
                    type: 'confirm',
                    name: 'useRecommendations',
                    message: 'Use these AI-recommended parameters?',
                    default: true
                }
            ]);
            if (useRecommendations) {
                maxAmount = aiParams.maxAmount;
                minAmount = aiParams.minAmount;
                timeBetween = aiParams.timeBetween;
                numBuys = aiParams.numBuys;
                numCycles = aiParams.numCycles;
                // Skip manual parameter input
                return {
                    contract,
                    maxAmount,
                    minAmount,
                    timeBetween,
                    jito,
                    numBuys,
                    directory,
                    numCycles,
                    useAi,
                    useProxies
                };
            }
        }
        else {
            console.log(chalk_1.default.yellow('Failed to get AI recommendations. Continuing with manual parameter input.'));
        }
    }
    // Handle trade settings
    const tradeSettingsAnswers = await inquirer_1.default.prompt([
        {
            type: 'input',
            name: 'maxAmount',
            message: 'Enter maximum trade amount in SOL:',
            default: maxAmount,
            validate: (input) => {
                const num = parseFloat(input);
                return (!isNaN(num) && num > 0) ? true : 'Please enter a positive number';
            }
        },
        {
            type: 'input',
            name: 'minAmount',
            message: 'Enter minimum trade amount in SOL:',
            default: minAmount,
            validate: (input) => {
                const num = parseFloat(input);
                const max = parseFloat(maxAmount);
                return (!isNaN(num) && num > 0 && num < max) ? true :
                    `Please enter a positive number less than maximum (${maxAmount})`;
            }
        },
        {
            type: 'input',
            name: 'timeBetween',
            message: 'Enter time between buys in milliseconds:',
            default: timeBetween,
            validate: (input) => {
                const num = parseInt(input);
                return (!isNaN(num) && num >= 0) ? true : 'Please enter a non-negative number';
            }
        },
        {
            type: 'input',
            name: 'numBuys',
            message: 'Enter number of buys before selling:',
            default: numBuys,
            validate: (input) => {
                const num = parseInt(input);
                return (!isNaN(num) && num > 0) ? true : 'Please enter a positive number';
            }
        },
        {
            type: 'input',
            name: 'directory',
            message: 'Enter directory for wallets:',
            default: directory
        },
        {
            type: 'input',
            name: 'numCycles',
            message: 'Enter number of cycles:',
            default: numCycles,
            validate: (input) => {
                const num = parseInt(input);
                return (!isNaN(num) && num > 0) ? true : 'Please enter a positive number';
            }
        }
    ]);
    maxAmount = tradeSettingsAnswers.maxAmount;
    minAmount = tradeSettingsAnswers.minAmount;
    timeBetween = tradeSettingsAnswers.timeBetween;
    numBuys = tradeSettingsAnswers.numBuys;
    directory = tradeSettingsAnswers.directory;
    numCycles = tradeSettingsAnswers.numCycles;
    // Make sure we have a contract
    if (!contract) {
        throw new Error('Contract address is required');
    }
    // Validate contract address
    try {
        new web3_js_1.PublicKey(contract);
    }
    catch (e) {
        throw new Error('Invalid contract address');
    }
    return {
        contract,
        maxAmount,
        minAmount,
        timeBetween,
        jito,
        numBuys,
        directory,
        numCycles,
        useAi,
        useProxies
    };
}
// Update or create .env file with bot settings
async function updateEnvFile(envPath, envVars) {
    try {
        console.log(chalk_1.default.cyan(`Updating environment variables at ${envPath}`));
        // Create .env content
        let envContent = '';
        // Read existing file if it exists
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
            // Update each variable
            for (const [key, value] of Object.entries(envVars)) {
                const regex = new RegExp(`^${key}=.*$`, 'm');
                if (regex.test(envContent)) {
                    // Update existing key
                    envContent = envContent.replace(regex, `${key}=${value}`);
                }
                else {
                    // Add new key
                    envContent += `\n${key}=${value}`;
                }
            }
        }
        else {
            // Create new file
            for (const [key, value] of Object.entries(envVars)) {
                envContent += `${key}=${value}\n`;
            }
        }
        // Write to file
        fs.writeFileSync(envPath, envContent);
        console.log(chalk_1.default.green(`Environment file updated successfully`));
        // Reload environment variables
        dotenv.config({ path: envPath, override: true });
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error updating .env file: ${error.message}`));
        throw error;
    }
}
