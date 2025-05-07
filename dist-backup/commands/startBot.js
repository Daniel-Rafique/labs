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
async function startBotCommand(options) {
    try {
        // Process options and prompt for missing ones
        const { contract, maxAmount, minAmount, timeBetween, jito, numBuys, directory, numCycles } = await processBotOptions(options);
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
            TRADE_TYPE: 'sol_spl'
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
            // Handle stdout data
            botProcess.stdout?.on('data', (data) => {
                spinner.stop();
                console.log(chalk_1.default.blue('[BOT]'), data.toString().trim());
            });
            // Handle stderr data
            botProcess.stderr?.on('data', (data) => {
                spinner.stop();
                console.error(chalk_1.default.red('[BOT ERROR]'), data.toString().trim());
            });
            // Notify user when bot has started
            setTimeout(() => {
                spinner.succeed('Bot started successfully!');
                console.log(chalk_1.default.green('\nBot is now running in the background.'));
                console.log(chalk_1.default.yellow('Press Ctrl+C to stop the CLI, but the bot will continue running.'));
                console.log(chalk_1.default.yellow('To stop the bot, you will need to terminate it manually using task manager or the kill command.'));
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
// Process and validate bot options
async function processBotOptions(options) {
    let { contract, maxAmount = '0.005', minAmount = '0.0005', timeBetween = '5000', jito = false, numBuys = '3', directory = 'user', numCycles = '1' } = options;
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
        numCycles
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
