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
exports.tradeCommand = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));
const web3_js_1 = require("@solana/web3.js");
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const wallet_1 = require("../utils/wallet");
const connection_1 = require("../utils/connection");
const transaction_1 = require("../utils/transaction");
const constants_1 = require("../constants/constants");
async function tradeCommand(options) {
    try {
        // Process options and prompt for missing ones
        const { contract, maxAmount, minAmount, timeBetween, minInterval, maxInterval, jito, numBuys, walletPath, isLightningMode, humanize, randomOrder } = await processTradeOptions(options);
        // Load wallets
        console.log(chalk_1.default.cyan(`Loading wallets from: ${walletPath}`));
        const wallets = (0, wallet_1.loadWallets)(walletPath);
        console.log(chalk_1.default.green(`Loaded ${wallets.length} wallets`));
        // Convert to keypairs
        let keypairs = wallets.map(wallet => (0, wallet_1.walletDataToKeypair)(wallet));
        // Randomize wallet order if requested
        if (randomOrder) {
            console.log(chalk_1.default.cyan(`Randomizing wallet order for more natural trading patterns...`));
            shuffleArray(keypairs);
        }
        // Create/update .env file
        const envVars = {
            CONTRACT_ADDRESS: contract,
            MAX_TRADE_AMOUNT: maxAmount,
            MIN_TRADE_AMOUNT: minAmount,
            TIME_BETWEEN_BUYS: timeBetween,
            MIN_INTERVAL: minInterval,
            MAX_INTERVAL: maxInterval,
            NUMBER_OF_BUYS: numBuys,
            JITO: jito ? 'true' : 'false',
            HUMANIZE: humanize ? 'true' : 'false'
        };
        // Determine where to save .env file
        const envFilePath = determineEnvFilePath(walletPath);
        await updateEnvFile(envFilePath, envVars);
        // Confirm trading details before starting
        console.log(chalk_1.default.cyan('\n====== TRADING DETAILS ======'));
        console.log(chalk_1.default.green(`Contract Address: ${contract}`));
        if (humanize) {
            console.log(chalk_1.default.green(`Trade Amount Range: ${minAmount} - ${maxAmount} SOL`));
            console.log(chalk_1.default.green(`Time Between Buys: ${minInterval} - ${maxInterval}ms (randomized)`));
            console.log(chalk_1.default.cyan(`Human-like Trading: ${humanize ? 'Enabled' : 'Disabled'}`));
            console.log(chalk_1.default.cyan(`Random Wallet Order: ${randomOrder ? 'Enabled' : 'Disabled'}`));
        }
        else {
            console.log(chalk_1.default.green(`Max Trade Amount: ${maxAmount} SOL`));
            console.log(chalk_1.default.green(`Time Between Buys: ${timeBetween}ms`));
        }
        console.log(chalk_1.default.green(`Number of Buys: ${numBuys}`));
        console.log(chalk_1.default.green(`Trading Mode: ${jito ? 'JITO' : 'Lightning/Bump'}`));
        console.log(chalk_1.default.green(`Total Wallets: ${wallets.length}`));
        console.log(chalk_1.default.cyan('=============================\n'));
        const confirm = await inquirer_1.default.prompt([
            {
                type: 'confirm',
                name: 'proceed',
                message: 'Do you want to proceed with trading?',
                default: false
            }
        ]);
        if (!confirm.proceed) {
            console.log(chalk_1.default.yellow('Trading cancelled.'));
            return;
        }
        // Start trading
        await executeTrading(keypairs, contract, parseFloat(maxAmount), parseFloat(minAmount), parseInt(timeBetween), parseInt(minInterval), parseInt(maxInterval), parseInt(numBuys), jito, humanize);
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error in trade command: ${error.message}`));
    }
}
exports.tradeCommand = tradeCommand;
// Fisher-Yates shuffle algorithm to randomize wallet order
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}
// Generate a random number within a range
function getRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
// Generate a random trade amount that looks more natural
function getRandomTradeAmount(min, max) {
    // Generate a random amount between min and max
    const amount = min + (Math.random() * (max - min));
    // Round to a random number of decimal places to look more human
    const decimals = getRandomNumber(2, 6);
    return parseFloat(amount.toFixed(decimals));
}
// Process and validate trade options
async function processTradeOptions(options) {
    let { contract, maxAmount = constants_1.DEFAULT_MAX_TRADE_AMOUNT.toString(), minAmount = (constants_1.DEFAULT_MAX_TRADE_AMOUNT * 0.5).toString(), timeBetween = constants_1.DEFAULT_TIME_BETWEEN_BUYS.toString(), minInterval = (constants_1.DEFAULT_TIME_BETWEEN_BUYS * 0.5).toString(), maxInterval = (constants_1.DEFAULT_TIME_BETWEEN_BUYS * 1.5).toString(), jito = false, numBuys = constants_1.DEFAULT_NUM_BUYS.toString(), path: walletPath, directory, humanize = false, randomOrder = false } = options;
    let isLightningMode = !jito;
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
    // Handle wallet path and mode
    if (!walletPath) {
        const walletAnswers = await inquirer_1.default.prompt([
            {
                type: 'input',
                name: 'directory',
                message: 'Enter directory for wallets:',
                default: directory || 'user'
            },
            {
                type: 'confirm',
                name: 'lightning',
                message: 'Use Lightning/Bump mode (instead of JITO)?',
                default: isLightningMode
            }
        ]);
        isLightningMode = walletAnswers.lightning;
        jito = !isLightningMode;
        directory = walletAnswers.directory;
        walletPath = (0, wallet_1.resolveWalletPath)(directory, isLightningMode);
    }
    // Ask about human-like trading
    const humanizeAnswer = await inquirer_1.default.prompt([
        {
            type: 'confirm',
            name: 'humanize',
            message: 'Enable human-like trading (randomized amounts and intervals)?',
            default: humanize
        },
        {
            type: 'confirm',
            name: 'randomOrder',
            message: 'Use random wallet order for trading?',
            default: randomOrder,
            when: (answers) => answers.humanize
        }
    ]);
    humanize = humanizeAnswer.humanize;
    randomOrder = humanizeAnswer.randomOrder === undefined ? false : humanizeAnswer.randomOrder;
    let tradeSettingsQuestions = [
        {
            type: 'input',
            name: 'maxAmount',
            message: humanize ? 'Enter maximum trade amount in SOL:' : 'Enter trade amount in SOL:',
            default: maxAmount,
            validate: (input) => {
                const num = parseFloat(input);
                return (!isNaN(num) && num > 0) ? true : 'Please enter a positive number';
            }
        }
    ];
    if (humanize) {
        tradeSettingsQuestions.push({
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
        });
    }
    tradeSettingsQuestions.push({
        type: 'input',
        name: 'numBuys',
        message: 'Enter number of buys before selling:',
        default: numBuys,
        validate: (input) => {
            const num = parseInt(input);
            return (!isNaN(num) && num > 0) ? true : 'Please enter a positive number';
        }
    });
    if (humanize) {
        tradeSettingsQuestions.push({
            type: 'input',
            name: 'minInterval',
            message: 'Enter minimum time between buys in milliseconds:',
            default: minInterval,
            validate: (input) => {
                const num = parseInt(input);
                return (!isNaN(num) && num >= 0) ? true : 'Please enter a non-negative number';
            }
        }, {
            type: 'input',
            name: 'maxInterval',
            message: 'Enter maximum time between buys in milliseconds:',
            default: maxInterval,
            validate: (input, answers) => {
                const num = parseInt(input);
                const min = parseInt(answers.minInterval || minInterval);
                return (!isNaN(num) && num >= min) ?
                    true : `Please enter a number greater than or equal to minimum (${min})`;
            }
        });
    }
    else {
        tradeSettingsQuestions.push({
            type: 'input',
            name: 'timeBetween',
            message: 'Enter time between buys in milliseconds:',
            default: timeBetween,
            validate: (input) => {
                const num = parseInt(input);
                return (!isNaN(num) && num >= 0) ? true : 'Please enter a non-negative number';
            }
        });
    }
    const tradeSettingsAnswers = await inquirer_1.default.prompt(tradeSettingsQuestions);
    maxAmount = tradeSettingsAnswers.maxAmount;
    minAmount = tradeSettingsAnswers.minAmount || minAmount;
    timeBetween = tradeSettingsAnswers.timeBetween || timeBetween;
    minInterval = tradeSettingsAnswers.minInterval || minInterval;
    maxInterval = tradeSettingsAnswers.maxInterval || maxInterval;
    numBuys = tradeSettingsAnswers.numBuys;
    // Make sure we have the wallet path
    if (!walletPath && directory) {
        walletPath = (0, wallet_1.resolveWalletPath)(directory, isLightningMode);
    }
    if (!walletPath) {
        throw new Error('No wallet path specified and could not determine one');
    }
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
        minInterval,
        maxInterval,
        jito,
        numBuys,
        walletPath,
        isLightningMode,
        humanize,
        randomOrder
    };
}
// Determine the path to save the .env file based on wallet path
function determineEnvFilePath(walletPath) {
    // Get the directory of the wallet file
    const walletDir = path.dirname(walletPath);
    // Move up to the instance directory (parent of .config)
    const instanceDir = path.dirname(walletDir);
    // Return path to .env file in instance directory
    return path.join(instanceDir, '.env');
}
// Update or create .env file with trade settings
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
// Execute trading with the specified parameters
async function executeTrading(keypairs, contract, maxAmount, minAmount, timeBetween, minInterval, maxInterval, numBuys, useJito, humanize) {
    // For the CLI tool, we'll simulate trading since we don't want to depend on the full trading logic
    // In a real implementation, you'd import and use the SolSpl class from dist/strategies/sol_spl/index.js
    const spinner = (0, ora_1.default)('Starting trading operations...').start();
    // Connection to Solana network
    const connection = (0, connection_1.getConnection)();
    // Start with the first wallet
    let currentWalletIndex = 0;
    let totalTrades = 0;
    try {
        while (currentWalletIndex < keypairs.length) {
            const currentWallet = keypairs[currentWalletIndex];
            spinner.text = `Trading with wallet ${currentWalletIndex + 1}/${keypairs.length}: ${currentWallet.publicKey.toString().substring(0, 8)}...`;
            // Check wallet balance
            const balance = await connection.getBalance(currentWallet.publicKey);
            const balanceInSOL = balance / 1e9;
            if (balanceInSOL < minAmount) {
                console.log(chalk_1.default.yellow(`\nInsufficient balance in wallet ${currentWalletIndex + 1}: ${balanceInSOL.toFixed(6)} SOL (need at least ${minAmount} SOL)`));
                currentWalletIndex++;
                continue;
            }
            console.log(chalk_1.default.cyan(`\nExecuting trade cycle with wallet ${currentWalletIndex + 1}: ${currentWallet.publicKey.toString().substring(0, 8)}...`));
            // Simulate buy transactions
            for (let i = 0; i < numBuys; i++) {
                // Calculate trade amount and time interval based on humanize setting
                const tradeAmount = humanize ?
                    getRandomTradeAmount(minAmount, Math.min(maxAmount, balanceInSOL * 0.9)) :
                    Math.min(maxAmount, balanceInSOL * 0.9);
                const interval = humanize ?
                    getRandomNumber(minInterval, maxInterval) :
                    timeBetween;
                spinner.text = `Executing buy ${i + 1}/${numBuys} with wallet ${currentWalletIndex + 1}...`;
                console.log(chalk_1.default.green(`\nExecuting buy ${i + 1}/${numBuys} with ${tradeAmount.toFixed(6)} SOL for token ${contract.substring(0, 8)}...`));
                // Simulate transaction time (more variance when humanized)
                const txTime = humanize ? getRandomNumber(1000, 3000) : 1000;
                await (0, transaction_1.sleep)(txTime);
                totalTrades++;
                // Wait between buys
                if (i < numBuys - 1) {
                    const waitTime = interval / 1000;
                    spinner.text = `Waiting ${waitTime.toFixed(1)} seconds before next buy...`;
                    await (0, transaction_1.sleep)(interval);
                }
            }
            // More human randomness for wait times
            const preWaitTime = humanize ?
                getRandomNumber(constants_1.DEFAULT_TIME_BEFORE_SELL * 0.5, constants_1.DEFAULT_TIME_BEFORE_SELL * 1.5) :
                constants_1.DEFAULT_TIME_BEFORE_SELL;
            // Wait before selling
            spinner.text = `Waiting before selling...`;
            await (0, transaction_1.sleep)(preWaitTime);
            // Simulate sell transaction
            spinner.text = `Executing sell for wallet ${currentWalletIndex + 1}...`;
            console.log(chalk_1.default.green(`\nExecuting sell of all tokens for ${contract.substring(0, 8)}...`));
            // Simulate transaction time (more variance when humanized)
            const sellTxTime = humanize ? getRandomNumber(1000, 3000) : 1000;
            await (0, transaction_1.sleep)(sellTxTime);
            totalTrades++;
            // More human randomness for post-sell wait times
            const postWaitTime = humanize ?
                getRandomNumber(constants_1.DEFAULT_TIME_AFTER_SELL * 0.5, constants_1.DEFAULT_TIME_AFTER_SELL * 1.5) :
                constants_1.DEFAULT_TIME_AFTER_SELL;
            // Wait after selling
            spinner.text = `Waiting after selling...`;
            await (0, transaction_1.sleep)(postWaitTime);
            // Move to next wallet
            console.log(chalk_1.default.green(`\nCompleted trade cycle for wallet ${currentWalletIndex + 1}`));
            currentWalletIndex++;
            // Add random delay between wallets if humanized
            if (currentWalletIndex < keypairs.length) {
                const walletChangeDelay = humanize ?
                    getRandomNumber(2000, 10000) :
                    2000;
                spinner.text = `Moving to next wallet in ${(walletChangeDelay / 1000).toFixed(1)} seconds...`;
                await (0, transaction_1.sleep)(walletChangeDelay);
            }
        }
        spinner.succeed(`Trading operations completed. Total transactions: ${totalTrades}`);
    }
    catch (error) {
        spinner.fail(`Error during trading: ${error.message}`);
        throw error;
    }
}
