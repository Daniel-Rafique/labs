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
exports.createWalletsCommand = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const child_process_1 = require("child_process");
const wallet_1 = require("../utils/wallet");
/**
 * Execute a shell command and return the output
 */
function executeCommand(command) {
    return new Promise((resolve, reject) => {
        (0, child_process_1.exec)(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(stdout);
        });
    });
}
/**
 * Backup existing wallet file
 */
function backupWalletFile(walletPath) {
    if (!fs.existsSync(walletPath)) {
        return '';
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${walletPath}.${timestamp}.backup`;
    fs.copyFileSync(walletPath, backupPath);
    return backupPath;
}
async function createWalletsCommand(options) {
    try {
        // Parse number of wallets
        const numWallets = parseInt(options.number, 10);
        if (isNaN(numWallets) || numWallets <= 0) {
            console.error(chalk_1.default.red('Invalid number of wallets. Please provide a positive integer.'));
            return;
        }
        // Get project root directory
        const projectRootDir = path.resolve(__dirname, '../../');
        // Make sure .config directory exists
        const configDir = path.join(projectRootDir, '.config');
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        // Wallets are saved to wallets.json by the wallet-lightning.js script
        const walletPath = path.join(configDir, 'wallets.json');
        // Check if we should append or create fresh wallets
        const shouldAppend = options.append === true;
        let existingWallets = [];
        // If wallet file exists and we need to handle it
        if (fs.existsSync(walletPath)) {
            if (shouldAppend) {
                // Load existing wallets for appending
                try {
                    existingWallets = (0, wallet_1.loadWallets)(walletPath);
                    console.log(chalk_1.default.blue(`Found ${existingWallets.length} existing wallets. Will append new wallets.`));
                }
                catch (error) {
                    console.error(chalk_1.default.yellow(`Error loading existing wallets: ${error}`));
                    console.log(chalk_1.default.yellow('Creating new wallet file instead.'));
                }
            }
            else {
                // Create backup before overwriting
                const backupPath = backupWalletFile(walletPath);
                if (backupPath) {
                    console.log(chalk_1.default.green(`Backed up existing wallets to: ${backupPath}`));
                }
            }
        }
        // Create spinner for feedback
        const spinner = (0, ora_1.default)(`Creating ${numWallets} wallets with Lightning API keys...`).start();
        try {
            // Use wallet-lightning.js script to generate wallets with API keys
            const lightningScriptPath = path.join(projectRootDir, 'wallet-lightning.js');
            if (fs.existsSync(lightningScriptPath)) {
                if (shouldAppend && existingWallets.length > 0) {
                    // If appending, we need to handle this differently since the script doesn't support append mode
                    spinner.text = `Creating ${numWallets} wallets using built-in method for append...`;
                    // Create wallets using built-in method and append
                    const newWallets = (0, wallet_1.createWallets)(numWallets, true);
                    const combinedWallets = [...existingWallets, ...newWallets];
                    (0, wallet_1.saveWallets)(combinedWallets, walletPath);
                    spinner.succeed(`Added ${numWallets} wallets to existing ${existingWallets.length} wallets!`);
                }
                else {
                    // For fresh wallet creation, use the script
                    await executeCommand(`node ${lightningScriptPath} ${numWallets}`);
                    spinner.succeed(`${numWallets} wallets created successfully!`);
                }
            }
            else {
                // If script doesn't exist, throw error to use fallback method
                throw new Error('Lightning wallet script not found.');
            }
            // Verify wallet file was created
            if (fs.existsSync(walletPath)) {
                const data = fs.readFileSync(walletPath, 'utf8');
                const wallets = JSON.parse(data);
                console.log(chalk_1.default.green(`Total wallets in file: ${wallets.length}`));
                console.log(chalk_1.default.green(`Wallet file saved to: ${walletPath}`));
                // Show sample wallet
                if (wallets.length > 0) {
                    console.log('\nSample wallet:');
                    console.log(chalk_1.default.cyan(`Public Key: ${wallets[0].publicKey}`));
                    if (wallets[0].apiKey) {
                        console.log(chalk_1.default.cyan(`API Key: ${wallets[0].apiKey.substring(0, 8)}...`));
                    }
                }
            }
            else {
                console.log(chalk_1.default.yellow(`Note: Wallet file was not found at ${walletPath}`));
                console.log(chalk_1.default.yellow(`Check the script output for the actual file location.`));
            }
        }
        catch (error) {
            spinner.fail(`Failed to create wallets with script: ${error.message}`);
            // Fallback to the built-in method
            console.log(chalk_1.default.yellow('Falling back to built-in wallet creation method...'));
            // Create wallets using the built-in method (always with API keys)
            const newWallets = (0, wallet_1.createWallets)(numWallets, true);
            // Append or overwrite based on user choice
            if (shouldAppend && existingWallets.length > 0) {
                const combinedWallets = [...existingWallets, ...newWallets];
                (0, wallet_1.saveWallets)(combinedWallets, walletPath);
                console.log(chalk_1.default.green(`Added ${newWallets.length} wallets to existing ${existingWallets.length} wallets`));
            }
            else {
                (0, wallet_1.saveWallets)(newWallets, walletPath);
                console.log(chalk_1.default.green(`Created ${newWallets.length} wallets using fallback method`));
            }
            console.log(chalk_1.default.green(`Wallet file saved to: ${walletPath}`));
            // Show sample wallet
            if (newWallets.length > 0) {
                console.log('\nSample wallet:');
                console.log(chalk_1.default.cyan(`Public Key: ${newWallets[0].publicKey}`));
                if (newWallets[0].apiKey) {
                    console.log(chalk_1.default.cyan(`API Key: ${newWallets[0].apiKey.substring(0, 8)}...`));
                }
            }
        }
        console.log(chalk_1.default.green('\nNote: These wallets include API keys and can be used in both JITO and Lightning modes.'));
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error creating wallets: ${error.message}`));
    }
}
exports.createWalletsCommand = createWalletsCommand;
