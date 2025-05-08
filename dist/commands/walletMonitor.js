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
exports.walletMonitorCommand = void 0;
const web3_js_1 = require("@solana/web3.js");
const path = __importStar(require("path"));
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const wallet_1 = require("../utils/wallet");
const connection_1 = require("../utils/connection");
const transaction_1 = require("../utils/transaction");
async function walletMonitorCommand(options) {
    try {
        // Get project root directory and set up wallet path
        const projectRootDir = path.resolve(__dirname, '../../');
        const configDir = path.join(projectRootDir, '.config');
        let walletPath = options.path;
        if (!walletPath) {
            // Always use the standard wallets.json file
            walletPath = path.join(configDir, 'wallets.json');
        }
        console.log(chalk_1.default.cyan(`Using wallet file: ${walletPath}`));
        // Load wallets
        const wallets = (0, wallet_1.loadWallets)(walletPath);
        console.log(chalk_1.default.green(`Loaded ${wallets.length} wallets`));
        // Get monitoring parameters
        const interval = options.interval ? parseInt(options.interval) :
            parseInt((await inquirer_1.default.prompt([{
                    type: 'input',
                    name: 'interval',
                    message: 'Check interval in seconds:',
                    default: '60',
                    validate: (input) => {
                        const num = parseInt(input);
                        return !isNaN(num) && num > 0 ? true : 'Please enter a valid positive number';
                    }
                }])).interval);
        const threshold = options.threshold ? parseFloat(options.threshold) :
            parseFloat((await inquirer_1.default.prompt([{
                    type: 'input',
                    name: 'threshold',
                    message: 'Alert threshold percentage (%):',
                    default: '5',
                    validate: (input) => {
                        const num = parseFloat(input);
                        return !isNaN(num) && num > 0 ? true : 'Please enter a valid positive number';
                    }
                }])).threshold);
        const duration = options.duration ? parseInt(options.duration) :
            parseInt((await inquirer_1.default.prompt([{
                    type: 'input',
                    name: 'duration',
                    message: 'Monitoring duration in minutes (0 for indefinite):',
                    default: '60',
                    validate: (input) => {
                        const num = parseInt(input);
                        return !isNaN(num) && num >= 0 ? true : 'Please enter a valid non-negative number';
                    }
                }])).duration);
        // Set up connection
        const connection = await (0, connection_1.getConnection)();
        // Initial snapshots
        console.log(chalk_1.default.cyan('\nTaking initial wallet snapshots...'));
        const spinner = (0, ora_1.default)('Processing wallets...').start();
        // Store initial snapshots
        const snapshots = new Map();
        // Take initial snapshots
        for (let i = 0; i < wallets.length; i++) {
            const wallet = wallets[i];
            spinner.text = `Processing wallet ${i + 1}/${wallets.length}: ${wallet.publicKey.substring(0, 8)}...`;
            try {
                // Get SOL balance
                const pubkey = new web3_js_1.PublicKey(wallet.publicKey);
                const balance = await connection.getBalance(pubkey);
                const solBalance = balance / 10 ** 9;
                // Get token balances
                const tokens = await (0, transaction_1.getAccountTokens)(connection, pubkey);
                const tokenData = tokens.map(token => ({
                    mint: token.mint,
                    amount: token.amount
                }));
                // Store snapshot
                snapshots.set(wallet.publicKey, {
                    timestamp: Date.now(),
                    publicKey: wallet.publicKey,
                    solBalance,
                    tokens: tokenData
                });
            }
            catch (error) {
                console.error(chalk_1.default.red(`\nError processing wallet ${wallet.publicKey}: ${error.message}`));
            }
        }
        spinner.succeed('Initial wallet snapshots complete');
        // Display monitoring settings
        console.log(chalk_1.default.green('\n========== Wallet Monitoring Settings =========='));
        console.log(chalk_1.default.green(`Wallets being monitored: ${wallets.length}`));
        console.log(chalk_1.default.green(`Check interval: ${interval} seconds`));
        console.log(chalk_1.default.green(`Alert threshold: ${threshold}%`));
        console.log(chalk_1.default.green(`Duration: ${duration === 0 ? 'indefinite' : duration + ' minutes'}`));
        console.log(chalk_1.default.green('=================================================\n'));
        console.log(chalk_1.default.yellow('Monitoring started. Press Ctrl+C to stop.\n'));
        // Start monitoring
        let monitoringActive = true;
        let checkCount = 0;
        const startTime = Date.now();
        const endTime = duration === 0 ? 0 : startTime + (duration * 60 * 1000);
        // Monitoring loop
        while (monitoringActive) {
            // Sleep for the interval
            await new Promise(resolve => setTimeout(resolve, interval * 1000));
            // Check if monitoring duration has elapsed
            if (endTime > 0 && Date.now() >= endTime) {
                console.log(chalk_1.default.yellow('\nMonitoring duration elapsed.'));
                break;
            }
            checkCount++;
            const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);
            console.log(chalk_1.default.cyan(`\n[Check #${checkCount}] Time elapsed: ${elapsedMinutes} minutes`));
            spinner.start('Checking wallet balances...');
            // Check each wallet
            for (let i = 0; i < wallets.length; i++) {
                const wallet = wallets[i];
                const initialSnapshot = snapshots.get(wallet.publicKey);
                if (!initialSnapshot) {
                    continue; // Skip if no initial snapshot
                }
                spinner.text = `Checking wallet ${i + 1}/${wallets.length}: ${wallet.publicKey.substring(0, 8)}...`;
                try {
                    // Get current SOL balance
                    const pubkey = new web3_js_1.PublicKey(wallet.publicKey);
                    const balance = await connection.getBalance(pubkey);
                    const solBalance = balance / 10 ** 9;
                    // Calculate percentage change
                    const solChange = ((solBalance - initialSnapshot.solBalance) / initialSnapshot.solBalance) * 100;
                    // Check if threshold exceeded
                    if (Math.abs(solChange) >= threshold) {
                        spinner.stopAndPersist({
                            symbol: solChange > 0 ? '🔼' : '🔽',
                            text: chalk_1.default.yellow(`SOL balance change detected in wallet ${wallet.publicKey.substring(0, 8)}...`)
                        });
                        console.log(chalk_1.default.yellow(`  Initial balance: ${initialSnapshot.solBalance.toFixed(6)} SOL`));
                        console.log(chalk_1.default.yellow(`  Current balance: ${solBalance.toFixed(6)} SOL`));
                        console.log(solChange > 0
                            ? chalk_1.default.green(`  Change: +${solChange.toFixed(2)}%`)
                            : chalk_1.default.red(`  Change: ${solChange.toFixed(2)}%`));
                        console.log(); // Empty line
                        spinner.start('Continuing checks...');
                    }
                    // Check token balances
                    const tokens = await (0, transaction_1.getAccountTokens)(connection, pubkey);
                    // Compare token balances
                    tokens.forEach(token => {
                        // Find token in initial snapshot
                        const initialToken = initialSnapshot.tokens.find(t => t.mint === token.mint);
                        if (initialToken) {
                            // Calculate percentage change
                            const tokenChange = ((token.amount - initialToken.amount) / initialToken.amount) * 100;
                            // Check if threshold exceeded
                            if (Math.abs(tokenChange) >= threshold) {
                                spinner.stopAndPersist({
                                    symbol: tokenChange > 0 ? '🔼' : '🔽',
                                    text: chalk_1.default.yellow(`Token balance change detected in wallet ${wallet.publicKey.substring(0, 8)}...`)
                                });
                                console.log(chalk_1.default.yellow(`  Token: ${token.mint.substring(0, 8)}...`));
                                console.log(chalk_1.default.yellow(`  Initial amount: ${initialToken.amount}`));
                                console.log(chalk_1.default.yellow(`  Current amount: ${token.amount}`));
                                console.log(tokenChange > 0
                                    ? chalk_1.default.green(`  Change: +${tokenChange.toFixed(2)}%`)
                                    : chalk_1.default.red(`  Change: ${tokenChange.toFixed(2)}%`));
                                console.log(); // Empty line
                                spinner.start('Continuing checks...');
                            }
                        }
                        else {
                            // New token not in initial snapshot
                            spinner.stopAndPersist({
                                symbol: '🆕',
                                text: chalk_1.default.yellow(`New token detected in wallet ${wallet.publicKey.substring(0, 8)}...`)
                            });
                            console.log(chalk_1.default.yellow(`  Token: ${token.mint.substring(0, 8)}...`));
                            console.log(chalk_1.default.yellow(`  Amount: ${token.amount}`));
                            console.log(); // Empty line
                            spinner.start('Continuing checks...');
                            // Add to initial snapshot to avoid repeated alerts
                            initialSnapshot.tokens.push({
                                mint: token.mint,
                                amount: token.amount
                            });
                        }
                    });
                    // Check for removed tokens
                    initialSnapshot.tokens.forEach(initialToken => {
                        const currentToken = tokens.find(t => t.mint === initialToken.mint);
                        if (!currentToken) {
                            // Token was removed/sold
                            spinner.stopAndPersist({
                                symbol: '❌',
                                text: chalk_1.default.yellow(`Token removed from wallet ${wallet.publicKey.substring(0, 8)}...`)
                            });
                            console.log(chalk_1.default.yellow(`  Token: ${initialToken.mint.substring(0, 8)}...`));
                            console.log(chalk_1.default.yellow(`  Previous amount: ${initialToken.amount}`));
                            console.log(chalk_1.default.red(`  Current amount: 0`));
                            console.log(); // Empty line
                            spinner.start('Continuing checks...');
                        }
                    });
                    // Update snapshot tokens
                    initialSnapshot.tokens = tokens.map(token => ({
                        mint: token.mint,
                        amount: token.amount
                    }));
                }
                catch (error) {
                    spinner.stopAndPersist({
                        symbol: '❌',
                        text: chalk_1.default.red(`Error checking wallet ${wallet.publicKey.substring(0, 8)}: ${error.message}`)
                    });
                    spinner.start('Continuing checks...');
                }
            }
            spinner.succeed(`Check #${checkCount} completed`);
        }
        console.log(chalk_1.default.green('Wallet monitoring completed.'));
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error in wallet monitor: ${error.message}`));
    }
}
exports.walletMonitorCommand = walletMonitorCommand;
