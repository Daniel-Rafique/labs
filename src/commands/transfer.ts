import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import * as path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { loadWallets, walletDataToKeypair } from '../utils/wallet';
import { getConnection } from '../utils/connection';
import { 
  transferSol, 
  transferSplToken, 
  sleep, 
  sendBundleToMultipleWallets,
  sendTransactionViaJito
} from '../utils/transaction';

import { 
  JITO_PRIORITY_FEE_MICROLAMPORTS, 
  JITO_MIN_TIP_LAMPORTS
} from '../constants/jito';

interface TransferOptions {
  path?: string;
  directory: string;
  amount: string;
  token?: string;
  split?: boolean;
}

export async function transferCommand(options: TransferOptions): Promise<void> {
  try {
    // Parse the transfer amount
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
      // Skip Lightning/JITO prompt for single recipient transfers - always use the standard wallet file
      walletPath = path.join(configDir, 'wallets.json');
      console.log(chalk.cyan(`Using wallet file: ${walletPath}`));
    }
    
    // Load wallets
    const wallets = loadWallets(walletPath);
    console.log(chalk.green(`Loaded ${wallets.length} wallets`));
    
    // Determine if we're transferring SOL or a token
    let tokenMint: PublicKey | undefined;
    if (options.token) {
      try {
        tokenMint = new PublicKey(options.token);
        console.log(chalk.cyan(`Will transfer token: ${tokenMint.toString()}`));
      } catch (error) {
        console.error(chalk.red('Invalid token mint address.'));
        return;
      }
    } else {
      console.log(chalk.cyan(`Will transfer SOL`));
    }
    
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
    
    // Set up connection and check balance
    const connection = await getConnection();
    const sourceBalance = await connection.getBalance(sourceKeypair.publicKey);
    const sourceBalanceSOL = sourceBalance / 1e9;
    console.log(chalk.yellow(`Source wallet balance: ${sourceBalanceSOL.toFixed(6)} SOL`));
    
    // Account for fees and Jito tip
    const jitoTip = JITO_MIN_TIP_LAMPORTS / 1e9; // Convert from lamports to SOL
    const estimatedFee = 0.00001; // 10,000 lamports for transaction fee
    
    // Check if balance is sufficient
    if (!tokenMint && sourceBalance < Math.floor(amount * 1e9) + (jitoTip + estimatedFee) * 1e9) {
      console.error(chalk.red(`Insufficient balance. Wallet has ${sourceBalanceSOL.toFixed(6)} SOL, transfer requires at least ${amount + jitoTip + estimatedFee} SOL including Jito tip and fees.`));
      return;
    }
    
    // Choose destination wallets
    let destinationWallets: PublicKey[] = [];
    
    if (options.split) {
      // Multiple destinations (splitting the amount)
      const { selectedWallets } = await inquirer.prompt([
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
        console.error(chalk.red('No destination wallets selected.'));
        return;
      }
      
      destinationWallets = selectedWallets.map((address: string) => new PublicKey(address));
    } else {
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
      
      const { destinationWallet } = await inquirer.prompt([
        {
          type: 'list',
          name: 'destinationWallet',
          message: 'Select destination wallet:',
          choices: destinationWalletChoices
        }
      ]);
      
      if (destinationWallet === 'custom') {
        const { customAddress } = await inquirer.prompt([
          {
            type: 'input',
            name: 'customAddress',
            message: 'Enter destination wallet address:',
            validate: (input) => {
              try {
                new PublicKey(input);
                return true;
              } catch (error) {
                return 'Please enter a valid Solana address';
              }
            }
          }
        ]);
        
        destinationWallets = [new PublicKey(customAddress)];
      } else {
        destinationWallets = [new PublicKey(destinationWallet)];
      }
    }
    
    // Process transfers
    const spinner = ora('Processing transfers...').start();
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
              await transferSplToken(
                connection,
                sourceKeypair,
                destinationWallet,
                tokenMint,
                amountPerWallet
              );
              
              successCount++;
              
              // Sleep to avoid rate limits
              if (i < destinationWallets.length - 1) {
                await sleep(500);
              }
            } catch (error: any) {
              failureCount++;
              console.error(chalk.red(`\nError transferring token to ${destinationWallet.toString()}: ${error.message}`));
            }
          }
        } else {
          // For SOL transfers to multiple destinations, use sendBundleToMultipleWallets
          const lamportsPerWallet = Math.floor(amountPerWallet * 1e9);
          const lamportsArray = destinationWallets.map(() => lamportsPerWallet);
          
          spinner.text = `Creating bundle for ${destinationWallets.length} SOL transfers...`;
          
          // Use the bundle function for one-to-many transfers
          await sendBundleToMultipleWallets(
            connection,
            sourceKeypair,
            destinationWallets,
            lamportsArray
          );
          
          // Count all as success if the bundle was accepted
          successCount += destinationWallets.length;
        }
      } catch (error: any) {
        failureCount += destinationWallets.length;
        console.error(chalk.red(`\nError with bulk transfer: ${error.message}`));
      }
    } else {
      // Single destination transfer - use Jito sendTransaction API
      try {
        if (tokenMint) {
          // For token transfers we'll use the existing transferSplToken function
          // Token transfers are already optimized in the current implementation
          await transferSplToken(
            connection,
            sourceKeypair,
            destinationWallets[0],
            tokenMint,
            amount
          );
        } else {
          // For SOL transfers, use our new Jito sendTransaction method
          spinner.text = `Transferring SOL to ${destinationWallets[0].toString().substring(0, 8)}... via Jito`;
          
          // Create transfer transaction
          const transaction = new Transaction();
          transaction.add(
            SystemProgram.transfer({
              fromPubkey: sourceKeypair.publicKey,
              toPubkey: destinationWallets[0],
              lamports: Math.floor(amount * 1e9)
            })
          );
          
          // Calculate fees based on distribution percentages
          const priorityFee = JITO_PRIORITY_FEE_MICROLAMPORTS;
          const jitoTip = JITO_MIN_TIP_LAMPORTS;
          
          // Send via our consolidated Jito transaction function
          await sendTransactionViaJito(
            connection,
            transaction,
            [sourceKeypair],
            {
              priorityFee,
              tipAmount: jitoTip
            }
          );
        }
        
        successCount++;
      } catch (error: any) {
        failureCount++;
        console.error(chalk.red(`\nError transferring to ${destinationWallets[0].toString()}: ${error.message}`));
        
        // Fall back to regular transfer if Jito fails
        try {
          spinner.text = `Falling back to standard transfer method...`;
          
          if (!tokenMint) {
            // Only fall back for SOL transfers, as token transfers already use standard method
            const lamportsToSend = Math.floor(amount * 1e9);
            await transferSol(
              connection,
              sourceKeypair,
              destinationWallets[0],
              lamportsToSend
            );
            
            successCount++;
            failureCount--; // Negate the previous failure
          }
        } catch (fallbackError: any) {
          console.error(chalk.red(`\nFallback transfer also failed: ${fallbackError.message}`));
        }
      }
    }
    
    spinner.stop();
    
    // Print transfer summary
    if (successCount > 0) {
      console.log(chalk.green(`\n✓ Successfully completed ${successCount} transfer(s)`));
    }
    
    if (failureCount > 0) {
      console.log(chalk.red(`\n✗ Failed to complete ${failureCount} transfer(s)`));
    }
    
  } catch (error: any) {
    console.error(chalk.red(`Error during transfer: ${error.message}`));
  }
} 