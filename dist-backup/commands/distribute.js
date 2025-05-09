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
exports.distributeCommand = void 0;
const web3_js_1 = require("@solana/web3.js");
const path = __importStar(require("path"));
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const wallet_1 = require("../utils/wallet");
const connection_1 = require("../utils/connection");
const transaction_1 = require("../utils/transaction");
const MAX_INSTRUCTIONS_PER_TRANSACTION = 5; // Solana has transaction size limits, so we limit batch size
async function distributeCommand(options) {
    try {
        // Parse the SOL amount to distribute
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
            // Always use the standard wallet file in .config directory
            walletPath = path.join(configDir, 'wallets.json');
            console.log(chalk_1.default.cyan(`Using wallet file: ${walletPath}`));
        }
        // Load wallets
        const wallets = (0, wallet_1.loadWallets)(walletPath);
        console.log(chalk_1.default.green(`Loaded ${wallets.length} wallets`));
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
        // Automatically select all destination wallets except the source
        const destinationWallets = wallets
            .filter(w => w.publicKey !== sourceWallet)
            .map(w => w.publicKey);
        if (destinationWallets.length === 0) {
            console.error(chalk_1.default.red('No destination wallets available. You need at least two wallets to distribute funds.'));
            return;
        }
        console.log(chalk_1.default.cyan(`Will distribute to ${destinationWallets.length} wallets`));
        // Set up connection
        const connection = await (0, connection_1.getConnection)();
        // Confirm source wallet balance
        const sourceBalance = await connection.getBalance(new web3_js_1.PublicKey(sourceWallet));
        const sourceBalanceSOL = sourceBalance / web3_js_1.LAMPORTS_PER_SOL;
        // Convert SOL to lamports (making sure we get an integer value)
        // We use Math.floor to ensure we don't get a non-integer value
        const amountInLamports = Math.floor(amount * web3_js_1.LAMPORTS_PER_SOL);
        const estimatedFeePerTx = 5000; // 5000 lamports per transaction
        const totalAmountNeeded = (amountInLamports * destinationWallets.length) + (estimatedFeePerTx * destinationWallets.length);
        const totalAmountNeededSOL = totalAmountNeeded / web3_js_1.LAMPORTS_PER_SOL;
        console.log(chalk_1.default.yellow(`Source wallet balance: ${sourceBalanceSOL.toFixed(6)} SOL`));
        console.log(chalk_1.default.yellow(`Total amount needed (including fees): ~${totalAmountNeededSOL.toFixed(6)} SOL`));
        console.log(chalk_1.default.yellow(`Base amount per wallet in lamports: ${amountInLamports} lamports (${(amountInLamports / web3_js_1.LAMPORTS_PER_SOL).toFixed(9)} SOL)`));
        if (sourceBalance < totalAmountNeeded) {
            console.error(chalk_1.default.red(`Insufficient balance. Source wallet has ${sourceBalanceSOL.toFixed(6)} SOL, but needs approximately ${totalAmountNeededSOL.toFixed(6)} SOL.`));
            return;
        }
        // Ask about distribution method
        const { distributionMethod } = await inquirer_1.default.prompt([
            {
                type: 'list',
                name: 'distributionMethod',
                message: 'Choose distribution method:',
                choices: [
                    { name: 'Standard (Individual transactions with privacy options)', value: 'standard' },
                    { name: 'Batched (Multiple transfers in fewer transactions - faster)', value: 'batch' }
                ],
                default: options.batch ? 'batch' : 'standard'
            }
        ]);
        let useStandardMethod = distributionMethod === 'standard';
        let useBatchMethod = distributionMethod === 'batch';
        let priorityFee = 0;
        // If using batch method, ask for details about batch size
        let batchSize = MAX_INSTRUCTIONS_PER_TRANSACTION;
        if (useBatchMethod) {
            console.log(chalk_1.default.cyan('\n===== Batched Transfer ====='));
            console.log(chalk_1.default.cyan(`This method combines multiple transfers into fewer transactions.`));
            console.log(chalk_1.default.cyan(`All transactions are signed locally - your private keys never leave this machine.`));
            console.log(chalk_1.default.cyan(`Solana limits how many operations can fit in one transaction.`));
            console.log(chalk_1.default.cyan(`Maximum recommended batch size: ${MAX_INSTRUCTIONS_PER_TRANSACTION} transfers per transaction.`));
            console.log(chalk_1.default.cyan('===========================\n'));
            const { confirmBatch } = await inquirer_1.default.prompt([
                {
                    type: 'confirm',
                    name: 'confirmBatch',
                    message: 'Continue with batched transfers?',
                    default: true
                }
            ]);
            if (!confirmBatch) {
                console.log(chalk_1.default.yellow('Switching to standard distribution method...'));
                useBatchMethod = false;
                useStandardMethod = true;
            }
            else {
                const priorityFeeResponse = await inquirer_1.default.prompt([
                    {
                        type: 'input',
                        name: 'priorityFee',
                        message: 'Enter priority fee in SOL (higher fee = faster confirmation, 0 for none):',
                        default: '0.0001',
                        validate: (input) => {
                            const fee = parseFloat(input);
                            if (isNaN(fee) || fee < 0) {
                                return 'Please enter a valid positive number';
                            }
                            return true;
                        }
                    }
                ]);
                priorityFee = parseFloat(priorityFeeResponse.priorityFee);
                // Only ask for batch size if we have enough destinations to make it relevant
                if (destinationWallets.length > MAX_INSTRUCTIONS_PER_TRANSACTION) {
                    const batchSizeResponse = await inquirer_1.default.prompt([
                        {
                            type: 'input',
                            name: 'batchSize',
                            message: `Enter batch size (1-${MAX_INSTRUCTIONS_PER_TRANSACTION} transfers per transaction):`,
                            default: MAX_INSTRUCTIONS_PER_TRANSACTION.toString(),
                            validate: (input) => {
                                const size = parseInt(input);
                                if (isNaN(size) || size < 1 || size > MAX_INSTRUCTIONS_PER_TRANSACTION) {
                                    return `Please enter a number between 1 and ${MAX_INSTRUCTIONS_PER_TRANSACTION}`;
                                }
                                return true;
                            }
                        }
                    ]);
                    batchSize = parseInt(batchSizeResponse.batchSize);
                }
            }
        }
        // If using standard method, ask about privacy features
        let usePrivacyFeatures = false;
        let randomizeAmounts = false;
        let randomizeOrder = false;
        let randomizeDelays = false;
        if (useStandardMethod) {
            const privacyResponse = await inquirer_1.default.prompt([
                {
                    type: 'confirm',
                    name: 'usePrivacyFeatures',
                    message: 'Enable privacy features to avoid transaction tracking on BubbleMaps?',
                    default: options.privacy || false
                }
            ]);
            usePrivacyFeatures = privacyResponse.usePrivacyFeatures;
            if (usePrivacyFeatures) {
                const { privacyOptions } = await inquirer_1.default.prompt([
                    {
                        type: 'checkbox',
                        name: 'privacyOptions',
                        message: 'Select privacy features to enable:',
                        choices: [
                            { name: 'Randomize amounts (±5-15% variation)', value: 'randomizeAmounts', checked: true },
                            { name: 'Randomize transaction order', value: 'randomizeOrder', checked: true },
                            { name: 'Use variable delays between transactions', value: 'randomizeDelays', checked: true },
                        ]
                    }
                ]);
                randomizeAmounts = privacyOptions.includes('randomizeAmounts');
                randomizeOrder = privacyOptions.includes('randomizeOrder');
                randomizeDelays = privacyOptions.includes('randomizeDelays');
            }
        }
        // Confirm distribution
        const { confirmDistribution } = await inquirer_1.default.prompt([
            {
                type: 'confirm',
                name: 'confirmDistribution',
                message: useBatchMethod
                    ? `Send ${(amount).toFixed(9)} SOL to each of the ${destinationWallets.length} wallets using batched transactions?`
                    : `Distribute ${(amountInLamports / web3_js_1.LAMPORTS_PER_SOL).toFixed(9)} SOL to each of the ${destinationWallets.length} wallets?`,
                default: false
            }
        ]);
        if (!confirmDistribution) {
            console.log(chalk_1.default.yellow('Distribution cancelled.'));
            return;
        }
        if (useStandardMethod && usePrivacyFeatures) {
            console.log(chalk_1.default.green('\n===== Privacy Features Enabled ====='));
            if (randomizeAmounts)
                console.log(chalk_1.default.green('✓ Randomizing transaction amounts'));
            if (randomizeOrder)
                console.log(chalk_1.default.green('✓ Randomizing transaction order'));
            if (randomizeDelays)
                console.log(chalk_1.default.green('✓ Using variable delays between transactions'));
            console.log(chalk_1.default.green('==================================\n'));
        }
        // Set up spinner for progress feedback
        let spinner = (0, ora_1.default)('Processing distribution...').start();
        // Track success and failure counts
        let successCount = 0;
        let failureCount = 0;
        // BATCH DISTRIBUTION METHOD
        if (useBatchMethod) {
            // Create a copy of destination wallets
            let processedWallets = [...destinationWallets.map(address => new web3_js_1.PublicKey(address))];
            // Calculate number of batches needed
            const numberOfBatches = Math.ceil(processedWallets.length / batchSize);
            spinner.text = `Processing ${processedWallets.length} transfers in ${numberOfBatches} batch transactions...`;
            // Process each batch
            for (let batchIndex = 0; batchIndex < numberOfBatches; batchIndex++) {
                // Get wallets for current batch
                const batchWallets = processedWallets.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize);
                try {
                    spinner.text = `Creating batch ${batchIndex + 1}/${numberOfBatches} (${batchWallets.length} transfers)...`;
                    // Get latest blockhash
                    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
                    // Create transaction
                    const transaction = new web3_js_1.Transaction();
                    // Add priority fee if specified
                    if (priorityFee > 0) {
                        const microLamports = Math.floor(priorityFee * web3_js_1.LAMPORTS_PER_SOL);
                        transaction.add(web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({
                            microLamports,
                        }));
                    }
                    // Add transfer instruction for each wallet in the batch
                    for (const destinationWallet of batchWallets) {
                        transaction.add(web3_js_1.SystemProgram.transfer({
                            fromPubkey: sourceKeypair.publicKey,
                            toPubkey: destinationWallet,
                            lamports: amountInLamports,
                        }));
                    }
                    // Set recent blockhash and fee payer
                    transaction.recentBlockhash = blockhash;
                    transaction.feePayer = sourceKeypair.publicKey;
                    // Sign transaction
                    transaction.sign(sourceKeypair);
                    // Send transaction
                    spinner.text = `Sending batch ${batchIndex + 1}/${numberOfBatches}...`;
                    const signature = await connection.sendRawTransaction(transaction.serialize());
                    // Wait for confirmation
                    spinner.text = `Confirming batch ${batchIndex + 1}/${numberOfBatches} (signature: ${signature.substring(0, 8)}...)`;
                    const confirmation = await connection.confirmTransaction({
                        blockhash,
                        lastValidBlockHeight,
                        signature,
                    });
                    if (confirmation.value.err) {
                        spinner.fail(`Batch ${batchIndex + 1} failed: ${confirmation.value.err}`);
                        failureCount += batchWallets.length;
                    }
                    else {
                        spinner.succeed(`Batch ${batchIndex + 1}/${numberOfBatches} confirmed (${batchWallets.length} transfers)`);
                        successCount += batchWallets.length;
                        console.log(chalk_1.default.green(`Transaction signature: ${signature}`));
                        console.log(chalk_1.default.green(`View on explorer: https://solscan.io/tx/${signature}`));
                    }
                    // Add delay between batches to avoid rate limiting
                    if (batchIndex < numberOfBatches - 1) {
                        const delay = 1000 + Math.random() * 1000;
                        spinner.text = `Waiting ${Math.round(delay)}ms before next batch...`;
                        await (0, transaction_1.sleep)(delay);
                        spinner = (0, ora_1.default)().start();
                    }
                }
                catch (error) {
                    spinner.fail(`Batch ${batchIndex + 1} failed: ${error.message}`);
                    failureCount += batchWallets.length;
                    // Add a longer delay after errors
                    if (batchIndex < numberOfBatches - 1) {
                        const errorDelay = 3000 + Math.random() * 2000;
                        spinner.text = `Error recovery cooldown (${Math.round(errorDelay)}ms)...`;
                        await (0, transaction_1.sleep)(errorDelay);
                        spinner = (0, ora_1.default)().start();
                    }
                }
            }
        }
        // STANDARD DISTRIBUTION METHOD
        else {
            // Create a copy of destination wallets that we can randomize if needed
            let processedWallets = [...destinationWallets];
            // Randomize wallet order if privacy option is enabled
            if (randomizeOrder) {
                processedWallets = shuffleArray(processedWallets);
                spinner.text = 'Randomized transaction order for privacy';
            }
            // Create and send transactions
            for (let i = 0; i < processedWallets.length; i++) {
                const destinationWalletAddress = processedWallets[i];
                const destinationWallet = new web3_js_1.PublicKey(destinationWalletAddress);
                // Calculate randomized amount if privacy option is enabled
                let actualLamportsToSend = amountInLamports;
                if (randomizeAmounts) {
                    // Random variation between -5% and +15% of the base amount
                    const minVariation = -0.05;
                    const maxVariation = 0.15;
                    const variation = minVariation + Math.random() * (maxVariation - minVariation);
                    actualLamportsToSend = Math.floor(amountInLamports * (1 + variation));
                    // Ensure minimum amount is at least 1000 lamports (0.000000001 SOL)
                    actualLamportsToSend = Math.max(actualLamportsToSend, 1000);
                }
                spinner.text = `[${i + 1}/${processedWallets.length}] Sending ${(actualLamportsToSend / web3_js_1.LAMPORTS_PER_SOL).toFixed(9)} SOL (${actualLamportsToSend} lamports) to wallet: ${destinationWalletAddress.substring(0, 8)}...`;
                try {
                    // Get recent blockhash for each transaction
                    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
                    // Create transaction
                    const transaction = new web3_js_1.Transaction().add(web3_js_1.SystemProgram.transfer({
                        fromPubkey: sourceKeypair.publicKey,
                        toPubkey: destinationWallet,
                        lamports: actualLamportsToSend,
                    }));
                    // Set recent blockhash and fee payer
                    transaction.recentBlockhash = blockhash;
                    transaction.feePayer = sourceKeypair.publicKey;
                    // Sign transaction
                    transaction.sign(sourceKeypair);
                    // Send transaction
                    const signature = await connection.sendRawTransaction(transaction.serialize());
                    // Wait for confirmation
                    const confirmation = await connection.confirmTransaction({
                        blockhash,
                        lastValidBlockHeight,
                        signature,
                    });
                    if (confirmation.value.err) {
                        spinner.fail(`Failed to send to ${destinationWalletAddress.substring(0, 8)}: ${confirmation.value.err}`);
                        failureCount++;
                        // Add a longer delay after failure to reduce rate limiting
                        if (i < processedWallets.length - 1) {
                            const errorDelay = 2000 + Math.random() * 1000;
                            spinner.text = `Rate limit cooldown (${Math.round(errorDelay)}ms)...`;
                            await (0, transaction_1.sleep)(errorDelay);
                        }
                    }
                    else {
                        successCount++;
                        // Add delay after successful transaction to avoid rate limiting
                        if (i < processedWallets.length - 1) {
                            let delay = 500;
                            if (randomizeDelays) {
                                // Use a more randomized delay for privacy
                                // Between 800ms and 3500ms with some probability of longer delays
                                const baseDelay = 800 + Math.floor(Math.random() * 2700);
                                const longDelayProbability = 0.15; // 15% chance of a longer delay
                                if (Math.random() < longDelayProbability) {
                                    // Longer delay between 4-8 seconds
                                    delay = 4000 + Math.floor(Math.random() * 4000);
                                }
                                else {
                                    delay = baseDelay;
                                }
                            }
                            else {
                                // Use a progressively increasing delay based on sequence
                                const baseDelay = 500;
                                const progressiveFactor = Math.min(1 + (i / processedWallets.length), 2);
                                delay = baseDelay * progressiveFactor + Math.random() * 300;
                            }
                            spinner.text = `Transaction confirmed. Cooling down (${Math.round(delay)}ms)...`;
                            await (0, transaction_1.sleep)(delay);
                        }
                    }
                }
                catch (error) {
                    spinner.fail(`Error sending to ${destinationWalletAddress.substring(0, 8)}: ${error.message}`);
                    failureCount++;
                    // Add a longer delay after errors, with exponential backoff if we get consecutive errors
                    if (i < processedWallets.length - 1) {
                        const baseErrorDelay = failureCount > 1 ? 2000 * failureCount : 2000;
                        const errorDelay = Math.min(baseErrorDelay, 10000) + Math.random() * 1000;
                        spinner.text = `Error recovery cooldown (${Math.round(errorDelay)}ms)...`;
                        await (0, transaction_1.sleep)(errorDelay);
                    }
                }
            }
        }
        spinner.succeed('Distribution completed');
        // Show summary
        console.log(chalk_1.default.green('\n========== Distribution Summary =========='));
        console.log(chalk_1.default.green(`Total wallets processed: ${destinationWallets.length}`));
        if (useBatchMethod) {
            console.log(chalk_1.default.green(`SOL per wallet: ${amount.toFixed(9)}`));
            console.log(chalk_1.default.green(`Distribution method: Batched Transfers (${batchSize} transfers per transaction)`));
            if (priorityFee > 0) {
                console.log(chalk_1.default.green(`Priority fee: ${priorityFee} SOL`));
            }
        }
        else {
            if (randomizeAmounts) {
                console.log(chalk_1.default.green(`Base SOL per wallet: ~${(amountInLamports / web3_js_1.LAMPORTS_PER_SOL).toFixed(9)} with ±5-15% variation`));
            }
            else {
                console.log(chalk_1.default.green(`SOL per wallet: ${(amountInLamports / web3_js_1.LAMPORTS_PER_SOL).toFixed(9)} (${amountInLamports} lamports)`));
            }
            if (usePrivacyFeatures) {
                console.log(chalk_1.default.cyan('\n========== Privacy Features Used =========='));
                if (randomizeAmounts)
                    console.log(chalk_1.default.cyan('✓ Randomized transaction amounts'));
                if (randomizeOrder)
                    console.log(chalk_1.default.cyan('✓ Randomized transaction order'));
                if (randomizeDelays)
                    console.log(chalk_1.default.cyan('✓ Used variable delays between transactions'));
                console.log(chalk_1.default.cyan('\nAdditional Privacy Tips:'));
                console.log(chalk_1.default.cyan('1. Use multi-hop transfers through intermediate wallets'));
                console.log(chalk_1.default.cyan('2. Use DEX swaps between transfers'));
                console.log(chalk_1.default.cyan('3. Distribute over longer time periods'));
            }
        }
        console.log(chalk_1.default.green(`Successful transactions: ${successCount}`));
        console.log(chalk_1.default.green(`Failed transactions: ${failureCount}`));
        console.log(chalk_1.default.green('========================================='));
    }
    catch (error) {
        console.error(chalk_1.default.red(`Error during distribution: ${error.message}`));
    }
}
exports.distributeCommand = distributeCommand;
// Helper function to shuffle an array (Fisher-Yates algorithm)
function shuffleArray(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
