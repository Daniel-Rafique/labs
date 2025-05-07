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
exports.transferCommand = void 0;
const web3_js_1 = require("@solana/web3.js");
const path = __importStar(require("path"));
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const wallet_1 = require("../utils/wallet");
const connection_1 = require("../utils/connection");
const transaction_1 = require("../utils/transaction");
const jito_1 = require("../constants/jito");
async function transferCommand(options) {
    try {
        // Parse the transfer amount
        const amount = parseFloat(options.amount);
        if (isNaN(amount) || amount <= 0) {
            console.error(chalk_1.default.red('Invalid amount. Please provide a valid positive number.'));
            return;
        }
        // Get project root directory and set up wallet path
        const projectRootDir = path.resolve(__dirname, '../../');
        const configDir = path.join(projectRootDir, '.config');
        let walletPath = options.path;
        if (!walletPath) {
            // Skip Lightning/JITO prompt for single recipient transfers - always use the standard wallet file
            walletPath = path.join(configDir, 'wallets.json');
            console.log(chalk_1.default.cyan(`Using wallet file: ${walletPath}`));
        }
        // Load wallets
        const wallets = (0, wallet_1.loadWallets)(walletPath);
        console.log(chalk_1.default.green(`Loaded ${wallets.length} wallets`));
        // Determine if we're transferring SOL or a token
        let tokenMint;
        if (options.token) {
            try {
                tokenMint = new web3_js_1.PublicKey(options.token);
                console.log(chalk_1.default.cyan(`Will transfer token: ${tokenMint.toString()}`));
            }
            catch (error) {
                console.error(chalk_1.default.red('Invalid token mint address.'));
                return;
            }
        }
        else {
            console.log(chalk_1.default.cyan(`Will transfer SOL`));
        }
        // Select source wallet
        const sourceWalletChoices = wallets.map((wallet, index) => ({
            name: `Wallet ${index + 1}: ${wallet.publicKey.substring(0, 8)}...`,
            value: wallet.publicKey
        }));
        const { sourceWallet } = await inquirer_1.default.prompt([
            {
                type: 'list',
                name: 'sourceWallet',
                message: 'Select source wallet:',
                choices: sourceWalletChoices
            }
        ]);
        const sourceWalletData = wallets.find(w => w.publicKey === sourceWallet);
        if (!sourceWalletData) {
            console.error(chalk_1.default.red('Source wallet not found.'));
            return;
        }
        // Get source wallet keypair
        const sourceKeypair = (0, wallet_1.walletDataToKeypair)(sourceWalletData);
        // Set up connection and check balance
        const connection = await (0, connection_1.getConnection)();
        const sourceBalance = await connection.getBalance(sourceKeypair.publicKey);
        const sourceBalanceSOL = sourceBalance / 1e9;
        console.log(chalk_1.default.yellow(`Source wallet balance: ${sourceBalanceSOL.toFixed(6)} SOL`));
        // Account for fees and Jito tip
        const jitoTip = jito_1.JITO_MIN_TIP_LAMPORTS / 1e9; // Convert from lamports to SOL
        const estimatedFee = 0.00001; // 10,000 lamports for transaction fee
        // Check if balance is sufficient
        if (!tokenMint && sourceBalance < Math.floor(amount * 1e9) + (jitoTip + estimatedFee) * 1e9) {
            console.error(chalk_1.default.red(`Insufficient balance. Wallet has ${sourceBalanceSOL.toFixed(6)} SOL, transfer requires at least ${amount + jitoTip + estimatedFee} SOL including Jito tip and fees.`));
            return;
        }
        // Choose destination wallets
        let destinationWallets = [];
        if (options.split) {
            // Multiple destinations (splitting the amount)
            const { selectedWallets } = await inquirer_1.default.prompt([
                {
                    type: 'checkbox',
                    name: 'selectedWallets',
                    message: 'Select destination wallets:',
                    choices: wallets
                        .filter(w => w.publicKey !== sourceWallet)
                        .map((wallet, index) => ({
                        name: `Wallet ${index + 1}: ${wallet.publicKey.substring(0, 8)}...`,
                        value: wallet.publicKey
                    }))
                }
            ]);
            if (selectedWallets.length === 0) {
                console.error(chalk_1.default.red('No destination wallets selected.'));
                return;
            }
            destinationWallets = selectedWallets.map((address) => new web3_js_1.PublicKey(address));
        }
        else {
            // Single destination
            const destinationWalletChoices = wallets
                .filter(w => w.publicKey !== sourceWallet)
                .map((wallet, index) => ({
                name: `Wallet ${index + 1}: ${wallet.publicKey.substring(0, 8)}...`,
                value: wallet.publicKey
            }));
            // Add option for custom address
            destinationWalletChoices.push({
                name: 'Enter custom address',
                value: 'custom'
            });
            const { destinationWallet } = await inquirer_1.default.prompt([
                {
                    type: 'list',
                    name: 'destinationWallet',
                    message: 'Select destination wallet:',
                    choices: destinationWalletChoices
                }
            ]);
            if (destinationWallet === 'custom') {
                const { customAddress } = await inquirer_1.default.prompt([
                    {
                        type: 'input',
                        name: 'customAddress',
                        message: 'Enter destination wallet address:',
                        validate: (input) => {
                            try {
                                new web3_js_1.PublicKey(input);
                                return true;
                            }
                            catch (error) {
                                return 'Please enter a valid Solana address';
                            }
                        }
                    }
                ]);
                destinationWallets = [new web3_js_1.PublicKey(customAddress)];
            }
            else {
                destinationWallets = [new web3_js_1.PublicKey(destinationWallet)];
            }
        }
        // Process transfers
        const spinner = (0, ora_1.default)('Processing transfers...').start();
        let successCount = 0;
        let failureCount = 0;
        if (options.split && destinationWallets.length > 1) {
            // Calculate amount per wallet
            const amountPerWallet = amount / destinationWallets.length;
            // For multiple destinations, use the bundle API
            try {
                spinner.text = `Creating bundle for ${destinationWallets.length} destinations...`;
                if (tokenMint) {
                    // Token transfers aren't supported in this bundle implementation yet
                    spinner.text = `Falling back to individual token transfers for multiple destinations...`;
                    // Perform individual token transfers
                    for (let i = 0; i < destinationWallets.length; i++) {
                        const destinationWallet = destinationWallets[i];
                        spinner.text = `Transferring token to wallet ${i + 1}/${destinationWallets.length}: ${destinationWallet.toString().substring(0, 8)}...`;
                        try {
                            await (0, transaction_1.transferSplToken)(connection, sourceKeypair, destinationWallet, tokenMint, amountPerWallet);
                            successCount++;
                            // Sleep to avoid rate limits
                            if (i < destinationWallets.length - 1) {
                                await (0, transaction_1.sleep)(500);
                            }
                        }
                        catch (error) {
                            failureCount++;
                            console.error(chalk_1.default.red(`\nError transferring token to ${destinationWallet.toString()}: ${error.message}`));
                        }
                    }
                }
                else {
                    // For SOL transfers to multiple destinations, use sendBundleToMultipleWallets
                    const lamportsPerWallet = Math.floor(amountPerWallet * 1e9);
                    const lamportsArray = destinationWallets.map(() => lamportsPerWallet);
                    spinner.text = `Creating bundle for ${destinationWallets.length} SOL transfers...`;
                    // Use the bundle function for one-to-many transfers
                    await (0, transaction_1.sendBundleToMultipleWallets)(connection, sourceKeypair, destinationWallets, lamportsArray);
                    // Count all as success if the bundle was accepted
                    successCount += destinationWallets.length;
                }
            }
            catch (error) {
                failureCount += destinationWallets.length;
                console.error(chalk_1.default.red(`\nError with bulk transfer: ${error.message}`));
            }
        }
        else {
            // Single destination transfer - use Jito sendTransaction API
            try {
                if (tokenMint) {
                    // For token transfers we'll use the existing transferSplToken function
                    // Token transfers are already optimized in the current implementation
                    await (0, transaction_1.transferSplToken)(connection, sourceKeypair, destinationWallets[0], tokenMint, amount);
                }
                else {
                    // For SOL transfers, use our new Jito sendTransaction method
                    spinner.text = `Transferring SOL to ${destinationWallets[0].toString().substring(0, 8)}... via Jito`;
                    // Create transfer transaction
                    const transaction = new web3_js_1.Transaction();
                    transaction.add(web3_js_1.SystemProgram.transfer({
                        fromPubkey: sourceKeypair.publicKey,
                        toPubkey: destinationWallets[0],
                        lamports: Math.floor(amount * 1e9)
                    }));
                    // Calculate fees based on distribution percentages
                    const priorityFee = jito_1.JITO_PRIORITY_FEE_MICROLAMPORTS;
                    const jitoTip = jito_1.JITO_MIN_TIP_LAMPORTS;
                    // Send via our consolidated Jito transaction function
                    await (0, transaction_1.sendTransactionViaJito)(connection, transaction, [sourceKeypair], {
                        priorityFee,
                        tipAmount: jitoTip
                    });
                }
                successCount++;
            }
            catch (error) {
                failureCount++;
                console.error(chalk_1.default.red(`\nError transferring to ${destinationWallets[0].toString()}: ${error.message}`));
                // Fall back to regular transfer if Jito fails
                try {
                    spinner.text = `Falling back to standard transfer method...`;
                    if (!tokenMint) {
                        // Only fall back for SOL transfers, as token transfers already use standard method
                        const lamportsToSend = Math.floor(amount * 1e9);
                        await (0, transaction_1.transferSol)(connection, sourceKeypair, destinationWallets[0], lamportsToSend);
                        successCount++;
                        failureCount--; // Negate the previous failure
                    }
                }
                catch (fallbackError) {
                    console.error(chalk_1.default.red(`\nFallback transfer also failed: ${fallbackError.message}`));
                }
            }
        }
        spinner.stop();
        // Print transfer summary
        if (successCount > 0) {
            console.log(chalk_1.default.green(`\n✓ Successfully completed ${successCount} transfer(s)`));
        }
        if (failureCount > 0) {
            console.log(chalk_1.default.red(`\n✗ Failed to complete ${failureCount} transfer(s)`));
        }
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error during transfer: ${error.message}`));
    }
}
exports.transferCommand = transferCommand;
