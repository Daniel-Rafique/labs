import { PublicKey, Connection, Transaction, SystemProgram, LAMPORTS_PER_SOL, TransactionInstruction, sendAndConfirmTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { resolveWalletPath, loadWallets, walletDataToKeypair, WalletData } from '../utils/wallet';
import { getConnection } from '../utils/connection';
import { sleep } from '../utils/transaction';
import { updateEnvJitoSetting } from '../utils/env';

interface DistributeOptions {
  path?: string;
  directory: string;
  amount: string;
  privacy?: boolean;
  batch?: boolean;
}

const MAX_INSTRUCTIONS_PER_TRANSACTION = 5; // Solana has transaction size limits, so we limit batch size

export async function distributeCommand(options: DistributeOptions): Promise<void> {
  try {
    // Parse the SOL amount to distribute
    const amount = parseFloat(options.amount);
    if (isNaN(amount) || amount <= 0) {
      console.error(chalk.red('Invalid amount. Please provide a valid positive number.'));
      return;
    }
    
    // Get project root directory and set up wallet path
    const projectRootDir = path.resolve(__dirname, '../../');
    const configDir = path.join(projectRootDir, '.config');
    let walletPath = options.path;
    
    if (!walletPath) {
      // Always use the standard wallet file in .config directory
      walletPath = path.join(configDir, 'wallets.json');
      console.log(chalk.cyan(`Using wallet file: ${walletPath}`));
    }
    
    // Load wallets
    const wallets = loadWallets(walletPath);
    console.log(chalk.green(`Loaded ${wallets.length} wallets`));

    // Select source wallet
    const sourceWalletChoices = wallets.map((wallet, index) => ({
      name: `Wallet ${index + 1}: ${wallet.publicKey.substring(0, 8)}...`,
      value: wallet.publicKey
    }));
    
    const { sourceWallet } = await inquirer.prompt([
      {
        type: 'list',
        name: 'sourceWallet',
        message: 'Select source wallet:',
        choices: sourceWalletChoices
      }
    ]);
    
    const sourceWalletData = wallets.find(w => w.publicKey === sourceWallet);
    if (!sourceWalletData) {
      console.error(chalk.red('Source wallet not found.'));
      return;
    }
    
    // Get source wallet keypair
    const sourceKeypair = walletDataToKeypair(sourceWalletData);
    
    // Automatically select all destination wallets except the source
    const destinationWallets = wallets
      .filter(w => w.publicKey !== sourceWallet)
      .map(w => w.publicKey);
    
    if (destinationWallets.length === 0) {
      console.error(chalk.red('No destination wallets available. You need at least two wallets to distribute funds.'));
      return;
    }
    
    console.log(chalk.cyan(`Will distribute to ${destinationWallets.length} wallets`));
    
    // Set up connection
    const connection = await getConnection();
    
    // Confirm source wallet balance
    const sourceBalance = await connection.getBalance(new PublicKey(sourceWallet));
    const sourceBalanceSOL = sourceBalance / LAMPORTS_PER_SOL;
    
    // Convert SOL to lamports (making sure we get an integer value)
    // We use Math.floor to ensure we don't get a non-integer value
    const amountInLamports = Math.floor(amount * LAMPORTS_PER_SOL);
    const estimatedFeePerTx = 5000; // 5000 lamports per transaction
    const totalAmountNeeded = (amountInLamports * destinationWallets.length) + (estimatedFeePerTx * destinationWallets.length);
    const totalAmountNeededSOL = totalAmountNeeded / LAMPORTS_PER_SOL;
    
    console.log(chalk.yellow(`Source wallet balance: ${sourceBalanceSOL.toFixed(6)} SOL`));
    console.log(chalk.yellow(`Total amount needed (including fees): ~${totalAmountNeededSOL.toFixed(6)} SOL`));
    console.log(chalk.yellow(`Base amount per wallet in lamports: ${amountInLamports} lamports (${(amountInLamports / LAMPORTS_PER_SOL).toFixed(9)} SOL)`));
    
    if (sourceBalance < totalAmountNeeded) {
      console.error(chalk.red(`Insufficient balance. Source wallet has ${sourceBalanceSOL.toFixed(6)} SOL, but needs approximately ${totalAmountNeededSOL.toFixed(6)} SOL.`));
      return;
    }

    // Ask about distribution method
    const { distributionMethod } = await inquirer.prompt([
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
      console.log(chalk.cyan('\n===== Batched Transfer ====='));
      console.log(chalk.cyan(`This method combines multiple transfers into fewer transactions.`));
      console.log(chalk.cyan(`All transactions are signed locally - your private keys never leave this machine.`));
      console.log(chalk.cyan(`Solana limits how many operations can fit in one transaction.`));
      console.log(chalk.cyan(`Maximum recommended batch size: ${MAX_INSTRUCTIONS_PER_TRANSACTION} transfers per transaction.`));
      console.log(chalk.cyan('===========================\n'));

      const { confirmBatch } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmBatch',
          message: 'Continue with batched transfers?',
          default: true
        }
      ]);

      if (!confirmBatch) {
        console.log(chalk.yellow('Switching to standard distribution method...'));
        useBatchMethod = false;
        useStandardMethod = true;
      } else {
        const priorityFeeResponse = await inquirer.prompt([
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
          const batchSizeResponse = await inquirer.prompt([
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
      const privacyResponse = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'usePrivacyFeatures',
          message: 'Enable privacy features to avoid transaction tracking on BubbleMaps?',
          default: options.privacy || false
        }
      ]);
      
      usePrivacyFeatures = privacyResponse.usePrivacyFeatures;

      if (usePrivacyFeatures) {
        const { privacyOptions } = await inquirer.prompt([
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
    const { confirmDistribution } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmDistribution',
        message: useBatchMethod 
          ? `Send ${(amount).toFixed(9)} SOL to each of the ${destinationWallets.length} wallets using batched transactions?`
          : `Distribute ${(amountInLamports / LAMPORTS_PER_SOL).toFixed(9)} SOL to each of the ${destinationWallets.length} wallets?`,
        default: false
      }
    ]);
    
    if (!confirmDistribution) {
      console.log(chalk.yellow('Distribution cancelled.'));
      return;
    }

    if (useStandardMethod && usePrivacyFeatures) {
      console.log(chalk.green('\n===== Privacy Features Enabled ====='));
      if (randomizeAmounts) console.log(chalk.green('✓ Randomizing transaction amounts'));
      if (randomizeOrder) console.log(chalk.green('✓ Randomizing transaction order'));
      if (randomizeDelays) console.log(chalk.green('✓ Using variable delays between transactions'));
      console.log(chalk.green('==================================\n'));
    }
    
    // Set up spinner for progress feedback
    let spinner = ora('Processing distribution...').start();
    
    // Track success and failure counts
    let successCount = 0;
    let failureCount = 0;
    
    // BATCH DISTRIBUTION METHOD
    if (useBatchMethod) {
      // Create a copy of destination wallets
      let processedWallets = [...destinationWallets.map(address => new PublicKey(address))];
      
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
          const transaction = new Transaction();
          
          // Add priority fee if specified
          if (priorityFee > 0) {
            const microLamports = Math.floor(priorityFee * LAMPORTS_PER_SOL);
            transaction.add(
              ComputeBudgetProgram.setComputeUnitPrice({
                microLamports,
              })
            );
          }
          
          // Add transfer instruction for each wallet in the batch
          for (const destinationWallet of batchWallets) {
            transaction.add(
              SystemProgram.transfer({
                fromPubkey: sourceKeypair.publicKey,
                toPubkey: destinationWallet,
                lamports: amountInLamports,
              })
            );
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
          } else {
            spinner.succeed(`Batch ${batchIndex + 1}/${numberOfBatches} confirmed (${batchWallets.length} transfers)`);
            successCount += batchWallets.length;
            console.log(chalk.green(`Transaction signature: ${signature}`));
            console.log(chalk.green(`View on explorer: https://solscan.io/tx/${signature}`));
          }
          
          // Add delay between batches to avoid rate limiting
          if (batchIndex < numberOfBatches - 1) {
            const delay = 1000 + Math.random() * 1000;
            spinner.text = `Waiting ${Math.round(delay)}ms before next batch...`;
            await sleep(delay);
            spinner = ora().start();
          }
        } catch (error: any) {
          spinner.fail(`Batch ${batchIndex + 1} failed: ${error.message}`);
          failureCount += batchWallets.length;
          
          // Add a longer delay after errors
          if (batchIndex < numberOfBatches - 1) {
            const errorDelay = 3000 + Math.random() * 2000;
            spinner.text = `Error recovery cooldown (${Math.round(errorDelay)}ms)...`;
            await sleep(errorDelay);
            spinner = ora().start();
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
        const destinationWallet = new PublicKey(destinationWalletAddress);
        
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
        
        spinner.text = `[${i + 1}/${processedWallets.length}] Sending ${(actualLamportsToSend / LAMPORTS_PER_SOL).toFixed(9)} SOL (${actualLamportsToSend} lamports) to wallet: ${destinationWalletAddress.substring(0, 8)}...`;
        
        try {
          // Get recent blockhash for each transaction
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
          
          // Create transaction
          const transaction = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: sourceKeypair.publicKey,
              toPubkey: destinationWallet,
              lamports: actualLamportsToSend,
            })
          );
          
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
              await sleep(errorDelay);
            }
          } else {
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
                } else {
                  delay = baseDelay;
                }
              } else {
                // Use a progressively increasing delay based on sequence
                const baseDelay = 500;
                const progressiveFactor = Math.min(1 + (i / processedWallets.length), 2);
                delay = baseDelay * progressiveFactor + Math.random() * 300;
              }
              
              spinner.text = `Transaction confirmed. Cooling down (${Math.round(delay)}ms)...`;
              await sleep(delay);
            }
          }
        } catch (error: any) {
          spinner.fail(`Error sending to ${destinationWalletAddress.substring(0, 8)}: ${error.message}`);
          failureCount++;
          
          // Add a longer delay after errors, with exponential backoff if we get consecutive errors
          if (i < processedWallets.length - 1) {
            const baseErrorDelay = failureCount > 1 ? 2000 * failureCount : 2000;
            const errorDelay = Math.min(baseErrorDelay, 10000) + Math.random() * 1000;
            spinner.text = `Error recovery cooldown (${Math.round(errorDelay)}ms)...`;
            await sleep(errorDelay);
          }
        }
      }
    }
    
    spinner.succeed('Distribution completed');
    
    // Show summary
    console.log(chalk.green('\n========== Distribution Summary =========='));
    console.log(chalk.green(`Total wallets processed: ${destinationWallets.length}`));
    if (useBatchMethod) {
      console.log(chalk.green(`SOL per wallet: ${amount.toFixed(9)}`));
      console.log(chalk.green(`Distribution method: Batched Transfers (${batchSize} transfers per transaction)`));
      if (priorityFee > 0) {
        console.log(chalk.green(`Priority fee: ${priorityFee} SOL`));
      }
    } else {
      if (randomizeAmounts) {
        console.log(chalk.green(`Base SOL per wallet: ~${(amountInLamports / LAMPORTS_PER_SOL).toFixed(9)} with ±5-15% variation`));
      } else {
        console.log(chalk.green(`SOL per wallet: ${(amountInLamports / LAMPORTS_PER_SOL).toFixed(9)} (${amountInLamports} lamports)`));
      }
      
      if (usePrivacyFeatures) {
        console.log(chalk.cyan('\n========== Privacy Features Used =========='));
        if (randomizeAmounts) console.log(chalk.cyan('✓ Randomized transaction amounts'));
        if (randomizeOrder) console.log(chalk.cyan('✓ Randomized transaction order'));
        if (randomizeDelays) console.log(chalk.cyan('✓ Used variable delays between transactions'));
        
        console.log(chalk.cyan('\nAdditional Privacy Tips:'));
        console.log(chalk.cyan('1. Use multi-hop transfers through intermediate wallets'));
        console.log(chalk.cyan('2. Use DEX swaps between transfers'));
        console.log(chalk.cyan('3. Distribute over longer time periods'));
      }
    }
    
    console.log(chalk.green(`Successful transactions: ${successCount}`));
    console.log(chalk.green(`Failed transactions: ${failureCount}`));
    console.log(chalk.green('========================================='));
    
  } catch (error: any) {
    console.error(chalk.red(`Error during distribution: ${error.message}`));
  }
}

// Helper function to shuffle an array (Fisher-Yates algorithm)
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
} 